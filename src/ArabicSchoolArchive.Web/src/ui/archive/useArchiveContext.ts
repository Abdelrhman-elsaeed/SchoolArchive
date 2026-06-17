import { useCallback, useMemo, useState } from "react";
import {
  type ActiveView,
  type FileTypeKey,
  type SavedView,
  viewById,
  filtersEqual,
} from "./savedViews.ts";

/**
 * Pure reducer for the "which side panel is open" question.
 *
 * The archive workspace has exactly one side panel anchored to the
 * trailing edge of the viewport. The same edge cannot host two
 * panels simultaneously — doing so renders two close buttons side
 * by side at the top of the workspace, which the user perceives as
 * duplicate ghost tabs (Phase 8.0.1 bug report).
 *
 * The two panels are:
 *   - the PreviewDrawer (`selectedDocumentId`)
 *   - the LocalGraphDrawer (`graphOpenFor`)
 *
 * They represent the same logical concern ("inspect this document")
 * at different levels of detail, so they are mutually exclusive.
 */
export interface PanelVisibility {
  selectedDocumentId: string | null;
  graphOpenFor: string | null;
}

export function applySelectDocument(
  prev: PanelVisibility,
  selectedDocumentId: string | null
): PanelVisibility {
  // Selecting a document closes any open graph for a *different*
  // document. Same-document coexistence is a transient state during
  // navigation; we still prefer a single panel at rest.
  if (prev.graphOpenFor && selectedDocumentId && prev.graphOpenFor === selectedDocumentId) {
    return prev;
  }
  if (prev.graphOpenFor && selectedDocumentId && prev.graphOpenFor !== selectedDocumentId) {
    return { graphOpenFor: null, selectedDocumentId };
  }
  return { ...prev, selectedDocumentId };
}

export function applyOpenGraph(
  prev: PanelVisibility,
  graphOpenFor: string | null
): PanelVisibility {
  if (graphOpenFor) {
    return { graphOpenFor, selectedDocumentId: null };
  }
  return { ...prev, graphOpenFor: null };
}

export type ViewLayout = "explorer" | "columns";

export interface ArchiveContextState {
  nameQuery: string;
  category: string | null;
  year: number | null;
  month: number | null;
  fileType: FileTypeKey | null;
  needsReview: boolean;
  unclassifiedOnly: boolean;
  activeViewId: string;
  layout: ViewLayout;
  selectedDocumentId: string | null;
  graphOpenFor: string | null;
}

export interface ArchiveContextSetters {
  setNameQuery: (q: string) => void;
  setCategory: (c: string | null) => void;
  setYear: (y: number | null) => void;
  setMonth: (m: number | null) => void;
  setFileType: (t: FileTypeKey | null) => void;
  setNeedsReview: (v: boolean) => void;
  setUnclassifiedOnly: (v: boolean) => void;
  setLayout: (l: ViewLayout) => void;
  setSelectedDocumentId: (id: string | null) => void;
  setGraphOpenFor: (id: string | null) => void;
  clearAll: () => void;
  removeFilter: (key: keyof ArchiveContextState) => void;
  applyView: (view: ActiveView | SavedView) => void;
  applyCustomView: (view: SavedView) => void;
  activeView: ActiveView | null;
  activeFilterCount: number;
}

const DEFAULT_STATE: ArchiveContextState = {
  nameQuery: "",
  category: null,
  year: null,
  month: null,
  fileType: null,
  needsReview: false,
  unclassifiedOnly: false,
  activeViewId: "all",
  layout: "explorer",
  selectedDocumentId: null,
  graphOpenFor: null,
};

export function useArchiveContext(): ArchiveContextState & ArchiveContextSetters {
  const [state, setState] = useState<ArchiveContextState>(DEFAULT_STATE);

  const update = useCallback(
    (patch: Partial<ArchiveContextState>) =>
      setState((s) => ({ ...s, ...patch })),
    []
  );

  const setNameQuery = useCallback(
    (nameQuery: string) => update({ nameQuery, activeViewId: deriveViewId({ ...state, nameQuery }) }),
    [state, update]
  );
  const setCategory = useCallback(
    (category: string | null) => update({ category, activeViewId: deriveViewId({ ...state, category }) }),
    [state, update]
  );
  const setYear = useCallback(
    (year: number | null) => update({ year, activeViewId: deriveViewId({ ...state, year }) }),
    [state, update]
  );
  const setMonth = useCallback(
    (month: number | null) => update({ month, activeViewId: deriveViewId({ ...state, month }) }),
    [state, update]
  );
  const setFileType = useCallback(
    (fileType: FileTypeKey | null) =>
      update({ fileType, activeViewId: deriveViewId({ ...state, fileType }) }),
    [state, update]
  );
  const setNeedsReview = useCallback(
    (needsReview: boolean) =>
      update({ needsReview, activeViewId: deriveViewId({ ...state, needsReview }) }),
    [state, update]
  );
  const setUnclassifiedOnly = useCallback(
    (unclassifiedOnly: boolean) =>
      update({
        unclassifiedOnly,
        activeViewId: deriveViewId({ ...state, unclassifiedOnly }),
      }),
    [state, update]
  );

  const setLayout = useCallback(
    (layout: ViewLayout) => update({ layout }),
    [update]
  );
  const setSelectedDocumentId = useCallback(
    (selectedDocumentId: string | null) => {
      setState((s) => ({
        ...s,
        ...applySelectDocument(
          { selectedDocumentId: s.selectedDocumentId, graphOpenFor: s.graphOpenFor },
          selectedDocumentId
        ),
      }));
    },
    []
  );
  const setGraphOpenFor = useCallback(
    (graphOpenFor: string | null) => {
      setState((s) => ({
        ...s,
        ...applyOpenGraph(
          { selectedDocumentId: s.selectedDocumentId, graphOpenFor: s.graphOpenFor },
          graphOpenFor
        ),
      }));
    },
    []
  );

  const clearAll = useCallback(() => {
    setState((s) => ({ ...DEFAULT_STATE, layout: s.layout }));
  }, []);

  const removeFilter = useCallback(
    (key: keyof ArchiveContextState) => {
      setState((s) => {
        if (key === "selectedDocumentId") return { ...s, selectedDocumentId: null };
        if (key === "graphOpenFor") return { ...s, graphOpenFor: null };
        const next: ArchiveContextState = { ...s };
        switch (key) {
          case "nameQuery":
            next.nameQuery = "";
            break;
          case "category":
            next.category = null;
            break;
          case "year":
            next.year = null;
            break;
          case "month":
            next.month = null;
            break;
          case "fileType":
            next.fileType = null;
            break;
          case "needsReview":
            next.needsReview = false;
            break;
          case "unclassifiedOnly":
            next.unclassifiedOnly = false;
            break;
          default:
            break;
        }
        next.activeViewId = deriveViewId(next);
        return next;
      });
    },
    []
  );

  const applyView = useCallback((view: ActiveView | SavedView) => {
    setState((s) => {
      const filters = view.filters;
      const next: ArchiveContextState = {
        ...s,
        nameQuery: filters.nameContains ?? "",
        category: filters.category ?? null,
        year: filters.processingYear ?? null,
        month: null,
        fileType: filters.fileType ?? null,
        needsReview: filters.needsReview ?? false,
        unclassifiedOnly: filters.unclassifiedOnly ?? false,
      };
      next.activeViewId = "id" in view ? view.id : deriveViewId(next);
      return next;
    });
  }, []);

  const applyCustomView = useCallback(
    (view: SavedView) => applyView(view),
    [applyView]
  );

  const activeView = useMemo<ActiveView | null>(() => {
    if (state.activeViewId === "custom") return null;
    return viewById(state.activeViewId) ?? null;
  }, [state.activeViewId]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.nameQuery) n += 1;
    if (state.category) n += 1;
    if (state.year) n += 1;
    if (state.month) n += 1;
    if (state.fileType) n += 1;
    if (state.needsReview) n += 1;
    if (state.unclassifiedOnly) n += 1;
    return n;
  }, [state]);

  // Safety net: if the user clears the preview AND a graph for the same
  // document was open, the graph stays open (it owns the panel now). If
  // a graph is open for document X and the user deselects document Y
  // entirely, we keep the graph open — the user is still inspecting X.
  // This effect is intentionally a no-op: panel exclusivity is enforced
  // by the setters above, so we don't need a reactive cleanup here.
  void state.selectedDocumentId;
  void state.graphOpenFor;

  return {
    ...state,
    setNameQuery,
    setCategory,
    setYear,
    setMonth,
    setFileType,
    setNeedsReview,
    setUnclassifiedOnly,
    setLayout,
    setSelectedDocumentId,
    setGraphOpenFor,
    clearAll,
    removeFilter,
    applyView,
    applyCustomView,
    activeView,
    activeFilterCount,
  };
}

function deriveViewId(s: ArchiveContextState): string {
  // Find a built-in view that matches the current filter set.
  // Iterate in priority order.
  const order: Array<"all" | "certificates" | "reports" | "images" | "current-year" | "needs-review" | "unclassified" | "recent"> = [
    "certificates",
    "reports",
    "images",
    "current-year",
    "needs-review",
    "unclassified",
    "recent",
    "all",
  ];
  for (const id of order) {
    const v = viewById(id);
    if (!v) continue;
    if (
      filtersEqual(
        {
          nameContains: s.nameQuery || undefined,
          category: s.category ?? undefined,
          processingYear: s.year ?? undefined,
          fileType: s.fileType ?? undefined,
          needsReview: s.needsReview || undefined,
          unclassifiedOnly: s.unclassifiedOnly || undefined,
        },
        v.filters
      ) &&
      (!!v.sortByRecent || true)
    ) {
      // also verify the sortByRecent heuristic if needed (not for now)
      return id;
    }
  }
  return "custom";
}
