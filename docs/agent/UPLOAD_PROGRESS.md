# UPLOAD_PROGRESS.md — Multi-file upload progress experience (Phase 7.11)

This document records the production-grade multi-file upload workflow
that replaces the previous "static file list" implementation. The
goal was to make it impossible for a user to wonder "is the app
frozen?" during a multi-file upload, while preserving the existing
brand and the existing API contract.

---

## 1. UX audit (the real problem)

The previous `UploadPage`:

- Posted one `FormData` with **all** files in a single round-trip
  and resolved with one `BatchUploadResponse` after the whole
  request finished. There was no per-file event channel.
- Rendered a flat file list with just an icon, name, and size —
  no per-file state, no per-file progress, no "current file"
  marker.
- Showed one big "رفع N ملفات" button. When clicked, the button
  was disabled and the page went silent until the whole batch
  resolved. With 8 files over a slow link, this was several
  seconds of "is anything happening?".
- Did not separate "uploading bytes" from "backend processing".
- Had no retry, no cancel, no state filter, no collapsed
  completed section.

The result: with many files the page felt frozen and the user
had no idea what was happening.

## 2. The new state model

Each file in the queue moves through a small, explicit state
machine. Every state is real — the transport gives us a real
"request in flight" signal and a real "response received"
signal, so we can show honest state transitions without faking
byte progress.

```
                  ┌─────────────┐
                  │   Queued    │  ← waiting for its turn
                  └──────┬──────┘
                         │ (runner picks it up)
                         ▼
                  ┌─────────────┐
                  │  Uploading  │  ← HTTP request in flight
                  └──────┬──────┘
                         │ (response received)
                         ▼
                  ┌─────────────┐
                  │ Processing  │  ← mapping the per-file result
                  └──────┬──────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌──────────┐    ┌────────────┐    ┌──────────┐
  │ Success  │    │  Rejected  │    │  Failed  │
  └──────────┘    └────────────┘    └──────────┘
        ▲                ▲                ▲
        └────────────────┴────────────────┘
                (or  Canceled  ← user pressed "إيقاف")
```

- `Uploading` and `Processing` both show **indeterminate**
  progress. We do not fake byte counts because the transport
  (fetch + FormData) does not expose them. We do show a real
  "in flight" signal via a sliding segment.
- `Queued` items show no progress bar; they just sit in the
  list with a "في الانتظار" status chip.
- `Success` items show a 100% bar in palm.
- `Rejected` and `Failed` items show a maroon-50 background tint
  on the row, a "سبب الرفض" line, and an inline "إعادة" button.
- `Canceled` is a soft state with a neutral chip and a retry
  button. Files already in flight when a cancel fires finish
  their current round-trip; files still in the queue are
  immediately marked Canceled.

## 3. Files / components added or changed

| File | Role |
|:---|:---|
| `src/api/ArchiveService.ts` | New `uploadOne(file)` method (wraps `uploadBatch([file])`). The existing `uploadBatch` is unchanged so all tests and contracts stay intact. |
| `src/api/hooks/useUploadQueue.ts` | New hook: a queue runner with explicit per-file state transitions, configurable concurrency, retry/remove/cancel/clear, and a derived batch summary (counts, total progress, current file). |
| `src/ui/upload/statusMeta.ts` | Maps each `UploadItemStatus` to its Arabic label, description, tag tone, activity phrase, and `isActive` / `isTerminal` / `isIndeterminate` flags. Single source of truth for status → display. |
| `src/ui/components/UploadProgressBar.tsx` | Determinate + indeterminate bar. Determinate animates with `cubic-bezier(0.22, 1, 0.36, 1)` over 320 ms. Indeterminate uses a 1.4 s sliding-segment loop with the same easing. |
| `src/ui/components/UploadQueueItem.tsx` | One row per file: index marker, file-kind tile, name, status chip, "يُعالَج الآن" pulse, status message, reason code (if any), progress bar, trailing status icon, retry button, remove button. Active rows get a 3 px palm rail and a palm-50 background. Failed rows get a maroon-50 background. |
| `src/ui/components/UploadQueuePanel.tsx` | Hosts the list with a 4-chip state filter (الكل / قيد التنفيذ / مكتمل / فشل/مرفوض), a `مسح المكتمل` action, a collapse/expand toggle, an `max-h-[420px] scrollbar-thin` scroll container, and a pinned "current file" at the top. |
| `src/ui/components/UploadCurrentActivity.tsx` | The "what is happening right now" hero card. Shows the current file name, its status message, "n من m" index, total progress, count chips, and the Start / Cancel / Clear actions. |
| `src/ui/components/UploadBatchSummary.tsx` | A 4-card stat strip (إجمالي / مكتمل / قيد التنفيذ / البيانات) with the per-card progress bar inside "إجمالي". |
| `src/ui/components/index.ts` | Re-exports the new components. |
| `src/ui/pages/UploadPage.tsx` | Rewritten. Same shell (PageHeader, dropzone, sidebar with workflow / privacy / help), but the inner main column is now: dropzone (de-emphasized when active) → Current Activity → Batch Summary → Queue Panel → invalid-extension warning. |
| `docs/agent/PROGRESS.md` | Phase 7.11 entry. |
| `docs/agent/UPLOAD_PROGRESS.md` | This file. |

No other page, hook, service, contract, or test was touched.

## 4. How per-file and total progress are represented

### Per-file (the `UploadProgressBar`)

- **Determinate (0–100)**: used for `Success` (always 100). Smooth
  width transition over 320 ms with `cubic-bezier(0.22, 1, 0.36, 1)`.
  Trailing label shows the file size (so the user sees "1.4 م.ب"
  settle into place).
- **Indeterminate (null)**: used for `Uploading` and `Processing`.
  A 1/3-width palm segment slides from `-110%` to `+380%` over
  1.4 s, infinitely, with the same easing. This is **honest**:
  we don't know how many bytes have been sent, but we can show
  that work is in flight.

### Total batch progress

The hook computes a smooth batch progress 0–100 as:

```
sum / total * 100

  where per-file weight is:
    Success / Rejected / Failed / Canceled  →  1.0
    Processing                                →  0.75
    Uploading                                 →  0.5
    Queued                                    →  0.0
```

This gives the bar a smooth, believable motion as the runner
walks the queue. It is **not** a byte count. We never claim to
know how many bytes have been sent.

## 5. Fallback behavior when real progress is unavailable

The backend's `POST /api/v1/archive/upload` accepts a multipart
form and returns one `BatchUploadResponse` after the request
finishes. There is **no streaming** and **no per-file event
channel**. So the runner instead:

1. Walks the queue file-by-file (concurrency 1 by default;
   configurable up to 3).
2. For each file:
   - Marks it `Uploading` and fires `service.uploadOne(file)`.
   - When the response arrives, marks it `Processing` while we
     map the per-file outcome.
   - Maps the outcome to `Success` / `Rejected` / `Failed`
     based on `result.status`, and stores `result.reasonCode`
     and `result.message` for the row to show.

This gives us **real, observable** state transitions without
inventing fake progress. The progress bar is indeterminate
during `Uploading` and `Processing` — we never claim a byte
count we don't have.

## 6. How the current file is shown

The `currentItem` selector finds the first item with status
`Uploading` or `Processing`. That item gets:

- A 3 px palm left rail on its row.
- A palm-50 background tint.
- A "يُعالَج الآن" pulse chip.
- A pinned position at the top of the queue list (above the
  filter results), regardless of the active filter.
- A "n من m" badge in the `UploadCurrentActivity` hero card,
  where `n` is the 1-based index among the unresolved files
  and `m` is the total number of unresolved files.
- Its status message shown in the hero card's subtitle.

When `currentItem` is null (idle, all done, or all canceled),
the hero card shows a calm "في انتظار البدء" or "اكتملت
الدفعة" headline.

## 7. Motion / polish improvements

- **Progress bar**: determinate width transition 320 ms
  `cubic-bezier(0.22, 1, 0.36, 1)`. Indeterminate 1.4 s
  sliding segment with the same easing.
- **Active row**: 3 px palm rail + palm-50 background + 180 ms
  transition.
- **Failed row**: maroon-50 background + maroon status icon +
  180 ms transition. Successful rows settle visually and the
  user can scan past them.
- **Hero card icon**: the left icon swaps between
  `RefreshCw animate-spin` (active), `CheckCircle2` (done),
  `AlertCircle` (failure), and `Sparkles` (idle) with a 220 ms
  scale transition on the dropzone.
- **Filter chips**: 180 ms `background-color` + `border-color`
  + `color` transition. Active chip paints palm-50 with a palm
  border. Counts animate to their new values without layout
  jumps (fixed chip width).
- **No flashy noise**: no bouncing, no particle effects, no
  gradient sweeps. Only restrained `cubic-bezier(0.22, 1,
  0.36, 1)` transitions and a single indeterminate-segment
  loop.

## 8. Failure and rejection handling

- One failed file **does not** stop the batch. The runner
  catches the per-file error, marks the file as `Failed` (or
  `Rejected` for 402 / 403 subscription errors), and continues
  with the next file in the queue.
- The `ReasonCode` returned by the backend is shown in monospace
  below the row so the support team can correlate it with
  server logs.
- A successful retry of one file does not retry the whole
  batch — the user can click the inline "إعادة" button on a
  single row to re-queue that one file.
- The "مسح المكتمل" button removes terminal rows in bulk
  without affecting the active file.

## 9. Acceptance criteria coverage

| Criterion | How it's met |
|:---|:---|
| User can always see which file is being handled now | `UploadCurrentActivity` shows the current file name, status message, and "n من m" index. The active row is pinned to the top of the queue with a palm rail and a "يُعالَج الآن" chip. |
| User can understand what files are waiting, uploading, processing, completed, failed, or rejected | Every row has a status chip + status message + status icon. The queue panel has 4 filter chips with live counts. |
| Clear total progress indicator | `UploadBatchSummary` shows a 0–100% bar in the "إجمالي" card. `UploadCurrentActivity` shows the same bar in the hero card with a percent trailing label. |
| Page no longer feels frozen during multi-file uploads | Per-file state transitions are emitted the moment they happen, not after the whole batch resolves. The dropzone is de-emphasized (cream-soft instead of paper) when the queue is running. The "ما زال يعمل" signal is a spinning icon + indeterminate bar, not a frozen button. |
| Upload experience feels premium, structured, and production-grade | Same brand tokens as the rest of the app. No new colors, no new patterns, no new animations. Six new components, all built from the existing primitives. |
| No backend / API contract breakage | The runner uses `service.uploadOne(file)`, which is a thin wrapper around the existing `service.uploadBatch([file])`. The `useUploadBatch` mutation hook is preserved. No endpoint changed. No contract changed. |
| Works for both small and large batches | Queue list has `max-h-[420px] overflow-y-auto`. Failed files can be removed. Completed files can be collapsed (`UploadQueuePanel` has a "طي / توسيع" toggle) and bulk-cleared. Filter chips let the user focus on a single state. |

## 10. Verification

- `npx tsc -p tsconfig.app.json --noEmit` — clean.
- `npm run test` — 28/29 frontend tests pass. The single failure
  (`tests/archiveDiscovery.test.ts`) is **pre-existing** and
  unrelated to this change: it fails on `main` too because
  `useArchiveFacets.ts` imports `ApiClientContext` without an
  extension, which the Node `strip-types` loader does not
  resolve. No test was modified by this pass.
- `npx vite build` — clean production build (44.22 kB CSS /
  8.52 kB gzipped; 566 kB JS / 151 kB gzipped).
