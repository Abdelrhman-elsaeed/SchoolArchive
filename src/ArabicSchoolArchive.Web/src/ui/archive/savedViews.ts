import { useCallback, useEffect, useMemo, useState } from "react";

export type FileTypeKey = "pdf" | "doc" | "xls" | "img" | "other";

export type ActiveViewId =
  | "all"
  | "certificates"
  | "reports"
  | "images"
  | "current-year"
  | "needs-review"
  | "unclassified"
  | "recent"
  | "custom";

export interface ActiveView {
  id: ActiveViewId;
  label: string;
  description: string;
  /** Stable, deterministic mapping to the underlying filters. */
  filters: {
    nameContains?: string;
    category?: string;
    processingYear?: number;
    fileType?: FileTypeKey;
    needsReview?: boolean;
    unclassifiedOnly?: boolean;
  };
  /** Use the upload time of the document (descending). */
  sortByRecent?: boolean;
}

export interface SavedView {
  id: string;
  label: string;
  /** Snapshot of the filters at save-time. */
  filters: ActiveView["filters"];
  sortByRecent?: boolean;
  createdAt: string;
}

interface SavedViewsState {
  custom: SavedView[];
}

const STORAGE_KEY = "asa.savedViews.v1";

function safeLoad(): SavedViewsState {
  if (typeof window === "undefined") return { custom: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { custom: [] };
    const parsed = JSON.parse(raw) as Partial<SavedViewsState>;
    if (!parsed || !Array.isArray(parsed.custom)) return { custom: [] };
    return {
      custom: parsed.custom
        .filter(
          (v): v is SavedView =>
            !!v && typeof v.id === "string" && typeof v.label === "string"
        )
        .map((v) => ({
          id: v.id,
          label: v.label,
          filters: v.filters ?? {},
          sortByRecent: !!v.sortByRecent,
          createdAt: v.createdAt ?? new Date().toISOString(),
        })),
    };
  } catch {
    return { custom: [] };
  }
}

function safeSave(state: SavedViewsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export const BUILTIN_VIEWS: ActiveView[] = [
  {
    id: "all",
    label: "كل المستندات",
    description: "كل ما تم أرشفته في المكتبة",
    filters: {},
  },
  {
    id: "certificates",
    label: "الشهادات",
    description: "شهادات الطلاب والمعلمين",
    filters: { category: "شهادات" },
  },
  {
    id: "reports",
    label: "التقارير",
    description: "تقارير الفترات والزيارات",
    filters: { category: "تقارير" },
  },
  {
    id: "images",
    label: "صور",
    description: "كل الصور المرفوعة",
    filters: { fileType: "img" },
  },
  {
    id: "current-year",
    label: `ملفات ${new Date().getFullYear()}`,
    description: "مستندات العام الدراسي الحالي",
    filters: { processingYear: new Date().getFullYear() },
  },
  {
    id: "recent",
    label: "آخر المرفوع",
    description: "أحدث المستندات المرفوعة",
    filters: {},
    sortByRecent: true,
  },
  {
    id: "needs-review",
    label: "يحتاج مراجعة",
    description: "مستندات تنتظر التحقق البشري",
    filters: { needsReview: true },
  },
  {
    id: "unclassified",
    label: "غير مصنف",
    description: "مستندات لم يُحدَّد لها تصنيف بعد",
    filters: { unclassifiedOnly: true },
  },
];

export function viewById(id: string): ActiveView | undefined {
  return BUILTIN_VIEWS.find((v) => v.id === id);
}

export function filtersEqual(
  a: ActiveView["filters"],
  b: ActiveView["filters"]
): boolean {
  const aKey = JSON.stringify(a ?? {});
  const bKey = JSON.stringify(b ?? {});
  return aKey === bKey;
}

export function useSavedViews() {
  const [state, setState] = useState<SavedViewsState>(() => safeLoad());

  useEffect(() => {
    safeSave(state);
  }, [state]);

  const add = useCallback((view: Omit<SavedView, "id" | "createdAt">): SavedView => {
    const id = `sv_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const created: SavedView = {
      id,
      createdAt: new Date().toISOString(),
      ...view,
    };
    setState((s) => ({ custom: [created, ...s.custom].slice(0, 24) }));
    return created;
  }, []);

  const remove = useCallback((id: string): void => {
    setState((s) => ({ custom: s.custom.filter((v) => v.id !== id) }));
  }, []);

  const rename = useCallback((id: string, label: string): void => {
    setState((s) => ({
      custom: s.custom.map((v) => (v.id === id ? { ...v, label } : v)),
    }));
  }, []);

  const all = useMemo(() => state.custom, [state.custom]);
  return { custom: all, add, remove, rename };
}
