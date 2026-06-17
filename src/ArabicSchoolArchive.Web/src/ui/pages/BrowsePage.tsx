import { useCallback, useState } from "react";
import {
  Sparkles,
  LayoutGrid,
  Columns3,
  Network,
  ShieldCheck,
} from "lucide-react";
import { useArchiveList } from "../../api/hooks/useArchives";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { SegmentedToggle, Alert } from "../components";
import { SmartExplorerView } from "../archive/SmartExplorerView";
import { ColumnNavigatorView } from "../archive/ColumnNavigatorView";
import { GraphErrorBoundary } from "../components/GraphErrorBoundary";
import { GraphView } from "../components/GraphView";
import type { ListArchivesQuery } from "../../api/ArchiveService";
import type { ApiError } from "../../api/ApiClient";

const GRAPH_PAGE_SIZE = 200;
const DEBOUNCE_MS = 250;

type BrowseViewMode = "explorer" | "columns" | "graph";

export function BrowsePage(): JSX.Element {
  const [viewMode, setViewMode] = useState<BrowseViewMode>("explorer");
  const [nameQuery] = useState("");
  const debouncedName = useDebouncedValue(nameQuery, DEBOUNCE_MS);

  // For the legacy "graph" mode, use a wide query to draw the full network.
  const graphQuery: ListArchivesQuery = {
    page: 1,
    pageSize: GRAPH_PAGE_SIZE,
    originalNameContains: debouncedName || undefined,
  };
  const graphList = useArchiveList(graphQuery);
  const apiError = graphList.isError
    ? (graphList.error as unknown as ApiError)
    : null;

  const handleDocumentOpen = useCallback((documentId: string): void => {
    window.location.hash = `#/archives/${documentId}`;
  }, []);

  const handleCategoryFilter = useCallback((category: string): void => {
    void category;
  }, []);

  return (
    <section className="flex flex-col gap-7">
      <header className="flex flex-col gap-5">
        <div className="asa-kicker inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-px w-6 bg-tan" />
          مكتبة المدرسة
        </div>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[2rem] font-bold leading-[1.1] tracking-tight text-ink-strong sm:text-[2.25rem] lg:text-[2.5rem]">
              الأرشيف
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
              استكشف المستندات المؤرشفة من خلال شجرة البيانات الوصفية،
              أو تصفّحها بعرض الأعمدة، أو افتح الشبكة المحلية لأي مستند
              لفهم علاقاته.
            </p>
            <div
              aria-hidden="true"
              className="mt-5 h-1 w-16 rounded-full bg-gradient-to-l from-palm to-tan"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedToggle<BrowseViewMode>
              ariaLabel="وضع العرض"
              size="sm"
              value={viewMode}
              onChange={setViewMode}
              options={[
                {
                  id: "explorer",
                  label: "الاستكشاف الذكي",
                  icon: (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  ),
                },
                {
                  id: "columns",
                  label: "الأعمدة",
                  icon: (
                    <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
                  ),
                },
                {
                  id: "graph",
                  label: "الشبكة",
                  icon: (
                    <LayoutGrid
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  ),
                },
              ]}
            />
            <ViewModeHint mode={viewMode} />
          </div>
        </div>
      </header>

      {apiError && (
        <Alert variant="error" title={errorTitleFor(apiError)}>
          {apiError.message}
        </Alert>
      )}

      {viewMode === "explorer" && (
        <SmartExplorerView
          onOpenDocument={handleDocumentOpen}
          onOpenUpload={() => (window.location.hash = "#/upload")}
        />
      )}

      {viewMode === "columns" && (
        <ColumnNavigatorView onOpenDocument={handleDocumentOpen} />
      )}

      {viewMode === "graph" && (
        <GraphModeView
          items={graphList.data?.items ?? []}
          isLoading={graphList.isLoading}
          onDocumentOpen={handleDocumentOpen}
          onCategoryFilter={handleCategoryFilter}
        />
      )}
    </section>
  );
}

function ViewModeHint({ mode }: { mode: BrowseViewMode }): JSX.Element {
  const map: Record<BrowseViewMode, { label: string; tone: "palm" | "tan" | "ink" }> = {
    explorer: { label: "افتراضي · بحث + شجرة", tone: "palm" },
    columns: { label: "تصفّح هرمي", tone: "tan" },
    graph: { label: "شبكة معرفية كاملة", tone: "ink" },
  };
  const v = map[mode];
  const tone =
    v.tone === "palm"
      ? "border-palm-200 bg-palm-50 text-palm-700"
      : v.tone === "tan"
      ? "border-tan-200 bg-tan-50 text-tan-700"
      : "border-navy-100 bg-navy-50 text-ink-strong";
  return (
    <span
      className={`hidden h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold sm:inline-flex ${tone}`}
    >
      {mode === "graph" ? (
        <Network className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {v.label}
    </span>
  );
}

function GraphModeView({
  items,
  isLoading,
  onDocumentOpen,
  onCategoryFilter,
}: {
  items: import("../../api/contracts").ArchiveItem[];
  isLoading: boolean;
  onDocumentOpen: (id: string) => void;
  onCategoryFilter: (cat: string) => void;
}): JSX.Element {
  if (isLoading) {
    return (
      <div className="asa-card flex items-center gap-2 p-6 text-[13px] text-ink-soft">
        <span className="asa-skeleton h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        جاري تحميل بيانات الشبكة…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="asa-card p-6 text-center text-[13px] text-ink-soft">
        لا توجد مستندات كافية لعرض الشبكة المعرفية.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="asa-card flex items-start gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-palm-50 text-palm-700">
          <Network className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-bold text-ink-strong">
            الشبكة المعرفية الكاملة
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            لمحة شاملة عن علاقات المستندات بالتصنيفات والوسوم. للحصول على
            تجربة أدق، افتح{" "}
            <span className="font-semibold text-ink-strong">
              الشبكة المحلية
            </span>{" "}
            من المعاينة التفصيلية لأي مستند.
          </p>
        </div>
      </div>
      <GraphErrorBoundary>
        <GraphView
          items={items}
          onDocumentOpen={onDocumentOpen}
          onCategoryFilter={onCategoryFilter}
          selectedCategory={null}
        />
      </GraphErrorBoundary>
    </div>
  );
}

function errorTitleFor(err: ApiError): string {
  if (err.status === 401) return "الجلسة غير صالحة";
  if (err.status === 402) return "الاشتراك منتهي الصلاحية";
  if (err.status === 403) return "الاشتراك موقوف";
  if (err.status === 404) return "العنصر غير موجود";
  if (err.status === 429) return "تم تجاوز الحد المسموح من الطلبات";
  if (err.status >= 500) return "خطأ في الخادم";
  return "تعذر إكمال العملية";
}
