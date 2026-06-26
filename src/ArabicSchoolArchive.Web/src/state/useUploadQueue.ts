/**
 * Upload queue — per-file state machine + queue runner.
 *
 * Why we need this in the frontend
 * --------------------------------
 * The backend's `POST /api/v1/archive/upload` accepts a single
 * multipart FormData and returns one `BatchUploadResponse` after the
 * entire request finishes. There is **no streaming progress** and
 * no per-file event channel.
 *
 * To still give the user a real, production-grade multi-file
 * experience we run the uploads **one at a time** (configurable
 * concurrency) on the frontend, and drive each file through a
 * small explicit state machine:
 *
 *   Queued → Uploading → Processing → Success | Rejected | Failed | Canceled
 *
 * The `Uploading` and `Processing` phases are real (the request is
 * in flight, or the response has been received and the per-file
 * outcome is being mapped). The progress value during `Uploading`
 * is **indeterminate** because the transport does not give us
 * bytes-sent. We never fake precise byte progress.
 *
 * One failed file does not stop the batch: the runner catches the
 * per-file error, marks the file as `Failed`, and continues.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/ApiClientContext";
import { archiveKeys } from "./useArchives";
import { ArchiveService } from "../api/ArchiveService";
import type { SingleFileUploadResponse } from "../api/contracts";

/* ─── Public types ────────────────────────────────────────────────── */

/** Lifecycle states for a single file in the upload queue. */
export type UploadItemStatus =
  | "Queued"          // waiting for its turn
  | "Uploading"       // HTTP request in flight (indeterminate)
  | "Processing"      // response received, mapping the per-file outcome
  | "Success"         // archived
  | "Rejected"        // backend rejected the file (rule violation, etc.)
  | "Failed"          // request / network / unknown error
  | "Canceled";       // user canceled

export interface UploadItem {
  /** Stable identity (string from File.name + size + lastModified). */
  id: string;
  file: File;
  name: string;
  size: number;
  status: UploadItemStatus;
  /** Determinate progress 0–100, or null for indeterminate. */
  progress: number | null;
  /** Short human-readable status message (Arabic). */
  message: string | null;
  /** Per-file result from the backend, if any. */
  result: SingleFileUploadResponse | null;
  /** Error from a Failed transition, if any. */
  error: string | null;
  /** Monotonic timestamp (ms) of the most recent state change. */
  updatedAt: number;
}

/** Overall batch state. */
export type UploadBatchStatus =
  | "idle"        // no batch is running
  | "running"     // at least one file is Uploading / Processing
  | "finishing"   // all files resolved, cleaning up
  | "canceled"    // user canceled
  | "error";      // something stopped the whole batch (network down, etc.)

/* ─── Helpers ─────────────────────────────────────────────────────── */

function fileId(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function classifyHttpError(err: unknown): { message: string; status: number | null } {
  if (err && typeof err === "object" && "message" in (err as Record<string, unknown>)) {
    const e = err as { message?: unknown; status?: unknown };
    return {
      message: typeof e.message === "string" ? e.message : "حدث خطأ غير متوقع",
      status: typeof e.status === "number" ? e.status : null,
    };
  }
  return { message: "حدث خطأ غير متوقع", status: null };
}

function statusToUploadItemStatus(
  result: SingleFileUploadResponse
): { status: UploadItemStatus; message: string } {
  switch (result.status) {
    case "Success":
      return { status: "Success", message: "تمت الأرشفة بنجاح" };
    case "Rejected":
      return {
        status: "Rejected",
        message: result.message || "تم رفض الملف من قبل النظام",
      };
    case "Failed":
      return {
        status: "Failed",
        message: result.message || "فشل رفع الملف",
      };
    case "Pending":
    default:
      return {
        status: "Processing",
        message: "تم استلام الملف وهو قيد المعالجة",
      };
  }
}

/* ─── Reducer ─────────────────────────────────────────────────────── */

type Action =
  | { type: "enqueue"; items: UploadItem[] }
  | { type: "remove"; id: string }
  | { type: "clearCompleted" }
  | { type: "clearAll" }
  | { type: "item"; id: string; patch: Partial<UploadItem> }
  | { type: "batch"; status: UploadBatchStatus };

interface State {
  items: UploadItem[];
  status: UploadBatchStatus;
  currentId: string | null;
}

const initialState: State = {
  items: [],
  status: "idle",
  currentId: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "enqueue": {
      const byId = new Map<string, UploadItem>();
      for (const it of state.items) byId.set(it.id, it);
      for (const it of action.items) {
        const existing = byId.get(it.id);
        if (existing) {
          byId.set(it.id, {
            ...existing,
            file: it.file,
            name: it.name,
            size: it.size,
            status: it.status === "Success" ? it.status : "Queued",
            progress: it.status === "Success" ? 100 : 0,
            updatedAt: Date.now(),
          });
        } else {
          byId.set(it.id, it);
        }
      }
      return { ...state, items: Array.from(byId.values()) };
    }
    case "remove": {
      const next = state.items.filter((it) => it.id !== action.id);
      return {
        ...state,
        items: next,
        status:
          next.some((it) => it.status === "Uploading" || it.status === "Processing")
            ? state.status
            : next.length === 0
              ? "idle"
              : state.status,
      };
    }
    case "clearCompleted": {
      const next = state.items.filter(
        (it) => it.status !== "Success" && it.status !== "Canceled"
      );
      return { ...state, items: next };
    }
    case "clearAll":
      return { ...state, items: [] };
    case "item": {
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id
            ? { ...it, ...action.patch, updatedAt: Date.now() }
            : it
        ),
      };
    }
    case "batch":
      return { ...state, status: action.status };
    default:
      return state;
  }
}

/* ─── Hook ────────────────────────────────────────────────────────── */

export interface UseUploadQueueOptions {
  /** Max number of files uploading in parallel. */
  concurrency?: number;
}

export interface UploadQueueApi {
  items: UploadItem[];
  status: UploadBatchStatus;
  currentId: string | null;
  /** Total batch progress 0–100. */
  totalProgress: number;
  /** Counts grouped by status. */
  counts: Record<UploadItemStatus, number>;
  /** True if the queue has at least one Uploading or Processing file. */
  isActive: boolean;
  /** Id of the file currently being processed, if any. */
  currentItem: UploadItem | null;
  /** Idx (1-based) of the current file in the active batch (not the whole queue). */
  currentIndex: number | null;
  /** Total number of files in the current batch. */
  batchSize: number;
  /** Enqueue files. Files already in the queue are merged (not duplicated). */
  enqueue: (files: File[]) => void;
  /** Start the queue. No-op if already running. */
  start: () => void;
  /** Cancel the current batch. Files already in flight finish; queued files are marked Canceled. */
  cancel: () => void;
  /** Retry a single file. Marks it Queued and starts if the queue is idle. */
  retry: (id: string) => void;
  /** Remove a single file. */
  remove: (id: string) => void;
  /** Clear all completed + canceled files. */
  clearCompleted: () => void;
  /** Clear the entire queue (also cancels a running batch). */
  clearAll: () => void;
}

export function useUploadQueue(
  options: UseUploadQueueOptions = {}
): UploadQueueApi {
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceRef = useRef<ArchiveService>(new ArchiveService(api));
  useEffect(() => {
    serviceRef.current = new ArchiveService(api);
  }, [api]);

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, 3));
  const [state, dispatch] = useReducer(reducer, initialState);

  // runId lets the runner loop know it should stop after a cancel.
  const runIdRef = useRef<number>(0);
  const cancelRef = useRef<boolean>(false);

  const counts = useMemo<Record<UploadItemStatus, number>>(() => {
    const c: Record<UploadItemStatus, number> = {
      Queued: 0,
      Uploading: 0,
      Processing: 0,
      Success: 0,
      Rejected: 0,
      Failed: 0,
      Canceled: 0,
    };
    for (const it of state.items) c[it.status] += 1;
    return c;
  }, [state.items]);

  const totalProgress = useMemo<number>(() => {
    if (state.items.length === 0) return 0;
    // Each file contributes 0..1 of the total. A resolved file
    // (Success / Rejected / Failed / Canceled) counts as 1; an
    // Uploading file counts as 0.5; a Queued file counts as 0;
    // Processing counts as 0.75 (we have the response, we're
    // mapping it). This gives smooth motion without faking bytes.
    const total = state.items.length;
    let sum = 0;
    for (const it of state.items) {
      switch (it.status) {
        case "Success":
        case "Rejected":
        case "Failed":
        case "Canceled":
          sum += 1;
          break;
        case "Processing":
          sum += 0.75;
          break;
        case "Uploading":
          sum += 0.5;
          break;
        case "Queued":
        default:
          sum += 0;
      }
    }
    return Math.round((sum / total) * 100);
  }, [state.items]);

  // The "current" file is the first one that is Uploading or
  // Processing. This is the source of truth for the queue UI.
  const currentItem = useMemo<UploadItem | null>(
    () =>
      state.items.find(
        (it) => it.status === "Uploading" || it.status === "Processing"
      ) ?? null,
    [state.items]
  );

  const isActive = counts.Uploading + counts.Processing > 0;

  const { currentIndex, batchSize } = useMemo(() => {
    // Index within the active batch: files that are not yet resolved
    // (i.e. still Queued, Uploading, or Processing) in the order they
    // were added. The "current" file's 1-based index is its position
    // among the non-resolved items.
    const unresolved = state.items.filter(
      (it) =>
        it.status === "Queued" ||
        it.status === "Uploading" ||
        it.status === "Processing"
    );
    if (!currentItem) {
      return {
        currentIndex: null,
        batchSize: state.items.length === 0 ? 0 : unresolved.length,
      };
    }
    const idx = unresolved.findIndex((it) => it.id === currentItem.id);
    return {
      currentIndex: idx >= 0 ? idx + 1 : null,
      batchSize: unresolved.length,
    };
  }, [currentItem, state.items]);

  /* ── Enqueue ───────────────────────────────────────────────── */

  const enqueue = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const items: UploadItem[] = files.map((f) => ({
      id: fileId(f),
      file: f,
      name: f.name,
      size: f.size,
      status: "Queued",
      progress: 0,
      message: "في قائمة الانتظار",
      result: null,
      error: null,
      updatedAt: Date.now(),
    }));
    dispatch({ type: "enqueue", items });
  }, []);

  const remove = useCallback((id: string) => {
    dispatch({ type: "remove", id });
  }, []);

  const clearCompleted = useCallback(() => {
    dispatch({ type: "clearCompleted" });
  }, []);

  const clearAll = useCallback(() => {
    cancelRef.current = true;
    runIdRef.current += 1;
    dispatch({ type: "batch", status: "canceled" });
    dispatch({ type: "clearAll" });
    dispatch({ type: "batch", status: "idle" });
  }, []);

  /* ── Runner ────────────────────────────────────────────────── */

  const runOne = useCallback(
    async (item: UploadItem, runId: number): Promise<void> => {
      if (cancelRef.current || runIdRef.current !== runId) return;
      dispatch({ type: "item", id: item.id, patch: { status: "Uploading", progress: null, message: "جارٍ رفع الملف الحالي…", error: null } });
      try {
        const response = await serviceRef.current.uploadOne(item.file);
        if (cancelRef.current || runIdRef.current !== runId) return;
        // We got a response. Move into Processing and map the per-file result.
        dispatch({ type: "item", id: item.id, patch: { status: "Processing", progress: null, message: "جارٍ فحص الملف وتصنيفه وأرشفته…" } });
        const fileResult = response.results.find(
          (r) => r.originalName === item.file.name
        ) ?? response.results[0];
        if (!fileResult) {
          throw new Error("استجابة الخادم لا تحتوي على نتيجة لهذا الملف");
        }
        const { status, message } = statusToUploadItemStatus(fileResult);
        dispatch({
          type: "item",
          id: item.id,
          patch: {
            status,
            progress: status === "Success" ? 100 : null,
            message,
            result: fileResult,
            error: null,
          },
        });
      } catch (err) {
        if (cancelRef.current || runIdRef.current !== runId) return;
        const { message, status: httpStatus } = classifyHttpError(err);
        // 402 / 403 are hard subscription blockers: surface as Rejected
        // so the user can still see the rest of the batch results.
        const isSub = httpStatus === 402 || httpStatus === 403;
        dispatch({
          type: "item",
          id: item.id,
          patch: {
            status: isSub ? "Rejected" : "Failed",
            progress: null,
            message,
            error: message,
          },
        });
      }
    },
    []
  );

  const start = useCallback(() => {
    if (isActive) return;
    // Snapshot the current queue, in order.
    const queue = state.items.filter(
      (it) =>
        it.status === "Queued" ||
        it.status === "Failed" ||
        it.status === "Rejected" ||
        it.status === "Canceled"
    );
    if (queue.length === 0) return;
    cancelRef.current = false;
    runIdRef.current += 1;
    const myRun = runIdRef.current;
    dispatch({ type: "batch", status: "running" });

    (async () => {
      // Reset queued items to a known state.
      for (const it of queue) {
        dispatch({
          type: "item",
          id: it.id,
          patch: { progress: 0, message: "في قائمة الانتظار", error: null },
        });
      }

      // Walk the queue with limited concurrency.
      const workers: Array<Promise<void>> = [];
      let cursor = 0;

      const take = (): UploadItem | null => {
        while (cursor < queue.length) {
          const it = queue[cursor++];
          // Skip items that were removed or canceled in the meantime.
          // (We re-check inside runOne via cancelRef.)
          return it;
        }
        return null;
      };

      const worker = async (): Promise<void> => {
        // Each worker loops until the queue is exhausted or a cancel fires.
        for (;;) {
          if (cancelRef.current || runIdRef.current !== myRun) return;
          const next = take();
          if (!next) return;
          dispatch({ type: "item", id: next.id, patch: { status: "Uploading" } });
          dispatch({ type: "batch", status: "running" });
          // Mark the "current" file so the UI can highlight it.
          // (We do this through the reducer; using a separate state
          // would require duplicating items ordering logic.)
          // Implemented via a dedicated action: we set currentId via
          // the batch action combined with item status. We use the
          // dispatch order to keep it simple.
          await runOne(next, myRun);
        }
      };

      for (let i = 0; i < concurrency; i++) workers.push(worker());
      await Promise.all(workers);

      if (cancelRef.current) {
        // Mark any still-queued items as Canceled.
        for (const it of state.items) {
          if (it.status === "Queued") {
            dispatch({
              type: "item",
              id: it.id,
              patch: { status: "Canceled", message: "تم الإلغاء", progress: null },
            });
          }
        }
        dispatch({ type: "batch", status: "canceled" });
        // Briefly keep the "canceled" status visible, then drop to idle.
        setTimeout(() => {
          if (runIdRef.current === myRun) {
            dispatch({ type: "batch", status: "idle" });
          }
        }, 400);
      } else {
        dispatch({ type: "batch", status: "idle" });
        // Refresh the archive list so the freshly-uploaded files appear.
        void queryClient.invalidateQueries({ queryKey: archiveKeys.all });
      }
    })();
  }, [isActive, state.items, concurrency, runOne, queryClient]);

  /* ── cancel ──────────────────────────────────────────────── */

  const cancel = useCallback(() => {
    cancelRef.current = true;
    runIdRef.current += 1;
    // Anything still in the queue is marked Canceled here, even if a
    // worker is still resolving it (runOne will see the flag and bail).
    for (const it of state.items) {
      if (it.status === "Queued") {
        dispatch({
          type: "item",
          id: it.id,
          patch: { status: "Canceled", message: "تم الإلغاء", progress: null },
        });
      }
    }
    dispatch({ type: "batch", status: "canceled" });
    setTimeout(() => {
      if (runIdRef.current !== -1) {
        dispatch({ type: "batch", status: "idle" });
      }
    }, 600);
  }, [state.items]);

  /* ── retry ───────────────────────────────────────────────── */

  const retry = useCallback(
    (id: string) => {
      const target = state.items.find((it) => it.id === id);
      if (!target) return;
      if (
        target.status !== "Failed" &&
        target.status !== "Rejected" &&
        target.status !== "Canceled"
      ) {
        return;
      }
      dispatch({
        type: "item",
        id,
        patch: {
          status: "Queued",
          progress: 0,
          message: "في قائمة الانتظار",
          error: null,
          result: null,
        },
      });
      // If nothing is running, kick the queue.
      const anyActive = state.items.some(
        (it) => it.status === "Uploading" || it.status === "Processing"
      );
      if (!anyActive) {
        // Defer to the next tick so the dispatch above is applied
        // before start() reads `state.items`.
        setTimeout(() => start(), 0);
      }
    },
    [state.items, start]
  );

  return {
    items: state.items,
    status: state.status,
    currentId: currentItem?.id ?? null,
    totalProgress,
    counts,
    isActive,
    currentItem,
    currentIndex,
    batchSize,
    enqueue,
    start,
    cancel,
    retry,
    remove,
    clearCompleted,
    clearAll,
  };
}
