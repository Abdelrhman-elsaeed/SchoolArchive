import { useCallback, useMemo, useState } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  LayoutGrid,
  Rows3,
  List,
  ChevronDown,
  Upload,
  Archive as ArchiveIcon,
  Sparkles,
} from "lucide-react";
import { useArchiveList } from "../../api/hooks/useArchives";
import { useArchiveFacets, getMonthNameAr, fileTypeLabel } from "../../api/hooks/useArchiveFacets";
import type { ListArchivesQuery } from "../../api/ArchiveService";
import type { ArchiveItem } from "../../api/contracts";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Input, Select, Button, Loading, EmptyState } from "../components";
import { MetadataTree } from "./MetadataTree";
import { SavedViewTabs } from "./SavedViewTabs";
import { DocumentRow, type RowVariant } from "./DocumentRow";
import { FilterPills } from "./FilterPills";
import { ContextBar } from "./ContextBar";
import { useArchiveContext } from "./useArchiveContext";
import { useSavedViews } from "./savedViews";
import { PreviewDrawer } from "./PreviewDrawer";
import { LocalGraphDrawer } from "./LocalGraphDrawer";

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 250;

interface SmartExplorerViewProps {
  onOpenDocument: (id: string) => void;
  onOpenUpload: () => void;
}

export function SmartExplorerView({
  onOpenDocument,
  onOpenUpload,
}: SmartExplorerViewProps): JSX.Element {
  const archive = useArchiveContext();
  const { custom, add, remove, rename } = useSavedViews();
  const [variant, setVariant] = useState<RowVariant>("card");
  const [variantOpen, setVariantOpen] = useState<boolean>(false);

  const debouncedName = useDebouncedValue(archive.nameQuery, DEBOUNCE_MS);

  // Build the query for the list (which is paginated).
  const listQuery: ListArchivesQuery = useMemo(
    () => ({
      page: 1,
      pageSize: 200, // local context already gives us a good preview; the API still paginates
      originalNameContains: debouncedName || undefined,
      category: archive.category ?? undefined,
      processingYear: archive.year ?? undefined,
      processingMonth: archive.month ?? undefined,
    }),
    [debouncedName, archive.category, archive.year, archive.month]
  );

  // Build a separate query for facets that does NOT apply name/category filters,
  // so the tree always shows what *could* match.
  const facetQuery: ListArchivesQuery = useMemo(
    () => ({
      page: 1,
      pageSize: 200,
      processingYear: archive.year ?? undefined,
    }),
    [archive.year]
  );

  const list = useArchiveList(listQuery);
  const facets = useArchiveFacets(facetQuery);

  // ── Client-side refinement ───────────────────────────────────────
  const refined = useMemo<ArchiveItem[]>(() => {
    let items = list.data?.items ?? [];
    if (archive.fileType) {
      items = items.filter((it) => classifyType(it.originalName) === archive.fileType);
    }
    if (archive.needsReview) {
      items = items.filter((it) => it.needsReview);
    }
    if (archive.unclassifiedOnly) {
      items = items.filter(
        (it) => !it.category || it.category.trim().length === 0
      );
    }
    if (archive.activeViewId === "recent" || archive.nameQuery || debouncedName) {
      items = sortByRecent(items);
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    list.data,
    archive.fileType,
    archive.needsReview,
    archive.unclassifiedOnly,
    archive.activeViewId,
    archive.nameQuery,
    debouncedName,
  ]);

  const paginated = useMemo(
    () => refined.slice(0, PAGE_SIZE),
    [refined]
  );
  const total = list.data?.totalCount ?? 0;
  const visibleCount = paginated.length;

  // ── Selection / Preview ──────────────────────────────────────────
  const selectedItem = useMemo<ArchiveItem | null>(() => {
    if (!archive.selectedDocumentId) return null;
    return (
      refined.find((it) => it.documentId === archive.selectedDocumentId) ??
      list.data?.items.find((it) => it.documentId === archive.selectedDocumentId) ??
      null
    );
  }, [archive.selectedDocumentId, refined, list.data]);

  // The graph seed is resolved directly from `archive.graphOpenFor`,
  // independent of the preview selection. This lets the graph open
  // even when the preview is closed (mutual exclusion is about the
  // panel being open, not about the data source).
  const graphSeed = useMemo<ArchiveItem | null>(() => {
    if (!archive.graphOpenFor) return null;
    return (
      refined.find((it) => it.documentId === archive.graphOpenFor) ??
      list.data?.items.find((it) => it.documentId === archive.graphOpenFor) ??
      null
    );
  }, [archive.graphOpenFor, refined, list.data]);

  const related = useMemo<ArchiveItem[]>(() => {
    if (!selectedItem) return [];
    const seedTags = new Set(
      (selectedItem.tags ?? []).map((t) => t.trim().toLowerCase())
    );
    return refined
      .filter((it) => it.documentId !== selectedItem.documentId)
      .map((it) => {
        const sameCat = it.category && it.category === selectedItem.category;
        const sameYear = it.processingYear === selectedItem.processingYear;
        const shared = (it.tags ?? []).filter((t) => seedTags.has(t.toLowerCase())).length;
        return { it, score: (sameCat ? 2 : 0) + (sameYear ? 1 : 0) + shared };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.it);
  }, [selectedItem, refined]);

  // ── Pills ────────────────────────────────────────────────────────
  const pills = useMemo(() => {
    const ps: Array<{
      id: string;
      label: string;
      tone: "palm" | "tan" | "ink" | "oud" | "maroon";
      icon?: React.ReactNode;
      onRemove: () => void;
    }> = [];
    if (archive.nameQuery) {
      ps.push({
        id: "name",
        label: `بحث: ${archive.nameQuery}`,
        tone: "palm",
        icon: <Search className="h-3 w-3" aria-hidden="true" />,
        onRemove: () => archive.setNameQuery(""),
      });
    }
    if (archive.category) {
      ps.push({
        id: "cat",
        label: `تصنيف: ${archive.category}`,
        tone: "tan",
        onRemove: () => archive.setCategory(null),
      });
    }
    if (archive.year) {
      ps.push({
        id: "year",
        label: `سنة: ${archive.year}`,
        tone: "ink",
        onRemove: () => archive.setYear(null),
      });
    }
    if (archive.month) {
      ps.push({
        id: "month",
        label: `شهر: ${getMonthNameAr(archive.month)}`,
        tone: "ink",
        onRemove: () => archive.setMonth(null),
      });
    }
    if (archive.fileType) {
      ps.push({
        id: "type",
        label: `نوع: ${fileTypeLabel(archive.fileType)}`,
        tone: "oud",
        onRemove: () => archive.setFileType(null),
      });
    }
    if (archive.needsReview) {
      ps.push({
        id: "review",
        label: "يحتاج مراجعة",
        tone: "maroon",
        onRemove: () => archive.setNeedsReview(false),
      });
    }
    if (archive.unclassifiedOnly) {
      ps.push({
        id: "unc",
        label: "غير مصنف",
        tone: "maroon",
        onRemove: () => archive.setUnclassifiedOnly(false),
      });
    }
    return ps;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    archive.nameQuery,
    archive.category,
    archive.year,
    archive.month,
    archive.fileType,
    archive.needsReview,
    archive.unclassifiedOnly,
  ]);

  // ── Handlers ─────────────────────────────────────────────────────
  const onSaveCurrent = useCallback(() => {
    const label =
      [
        archive.category,
        archive.year ? String(archive.year) : null,
        archive.fileType ? fileTypeLabel(archive.fileType) : null,
      ]
        .filter(Boolean)
        .join(" · ") || "مشهد مخصص";
    add({
      label,
      filters: {
        nameContains: archive.nameQuery || undefined,
        category: archive.category ?? undefined,
        processingYear: archive.year ?? undefined,
        fileType: archive.fileType ?? undefined,
        needsReview: archive.needsReview || undefined,
        unclassifiedOnly: archive.unclassifiedOnly || undefined,
      },
    });
  }, [archive, add]);

  const canSave = archive.activeFilterCount > 0;

  // Crumbs
  const crumbs = useMemo(() => {
    const cs: Array<{
      id: string;
      label: React.ReactNode;
      onClick?: () => void;
      current?: boolean;
    }> = [];
    cs.push({
      id: "archive",
      label: "الأرشيف",
      onClick: () => archive.clearAll(),
    });
    if (archive.category) {
      cs.push({
        id: "cat",
        label: archive.category,
        onClick: () => archive.setCategory(null),
      });
    }
    if (archive.year) {
      cs.push({
        id: "year",
        label: String(archive.year),
        onClick: () => archive.setYear(null),
      });
    }
    if (archive.fileType) {
      cs.push({
        id: "type",
        label: fileTypeLabel(archive.fileType),
        onClick: () => archive.setFileType(null),
      });
    }
    if (archive.activeView) {
      cs.push({
        id: "view",
        label: archive.activeView.label,
        current: true,
      });
    } else if (archive.activeFilterCount > 0) {
      cs.push({ id: "view", label: "مشهد مخصص", current: true });
    } else {
      cs.push({ id: "view", label: "كل المستندات", current: true });
    }
    return cs;
  }, [archive]);

  return (
    <div className="flex flex-col gap-5">
      {/* Command / search bar */}
      <div className="asa-card relative flex flex-col gap-3 p-4 sm:p-5">
        <ContextBar
          crumbs={crumbs}
          right={
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-md border border-palm-200 bg-palm-50 px-2.5 py-1 text-[11px] font-semibold text-palm-700 sm:inline-flex">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                الاستكشاف الذكي
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenUpload}
                leadingIcon={<Upload className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                رفع جديد
              </Button>
            </div>
          }
        />

        {/* Search row */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1 min-w-0">
            <Input
              leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              trailingIcon={
                archive.nameQuery ? (
                  <button
                    type="button"
                    onClick={() => archive.setNameQuery("")}
                    className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-soft transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
                    aria-label="مسح البحث"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null
              }
              type="search"
              value={archive.nameQuery}
              onChange={(e) => archive.setNameQuery(e.target.value)}
              placeholder="ابحث في كل الأرشيف…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                value={archive.year != null ? String(archive.year) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  archive.setYear(v ? Number(v) : null);
                }}
                forceLtr
              >
                <option value="">كل السنوات</option>
                {Array.from({ length: 11 }, (_, i) => 2026 - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select
                value={archive.month != null ? String(archive.month) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  archive.setMonth(v ? Number(v) : null);
                }}
              >
                <option value="">كل الأشهر</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {getMonthNameAr(m)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Saved view pills */}
        <div className="border-t border-border-soft pt-3">
          <SavedViewTabs
            activeId={archive.activeViewId}
            onApply={(v) => archive.applyView(v)}
            custom={custom}
            onRemoveCustom={remove}
            onRenameCustom={rename}
            onSaveCurrent={onSaveCurrent}
            canSave={canSave}
          />
        </div>

        {/* Active filter pills + status */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-3">
          <FilterPills
            filters={pills}
            onClearAll={archive.activeFilterCount > 0 ? () => archive.clearAll() : undefined}
          />
          <div className="flex items-center gap-3 text-[11.5px] text-ink-soft">
            <span className="font-mono tnum">
              {visibleCount} / {refined.length}
            </span>
            <span className="hidden sm:inline">مستند في النطاق الحالي</span>
          </div>
        </div>
      </div>

      {/* Workspace: tree + results + preview drawer */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_auto]">
        {/* Left: Metadata tree */}
        <aside className="asa-card overflow-hidden lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-100px)] lg:self-start">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-cream-soft/40 px-3 py-2.5">
            <span className="font-kufi text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
              شجرة البيانات الوصفية
            </span>
            {archive.activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => archive.clearAll()}
                className="font-kufi text-[10px] uppercase tracking-[0.18em] text-palm-700 transition-colors duration-180 ease-out-expo hover:text-palm"
              >
                إعادة التعيين
              </button>
            )}
          </div>
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin">
            {facets.isLoading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-ink-soft">
                <span className="asa-skeleton h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                جاري تحميل البيانات الوصفية…
              </div>
            ) : facets.data ? (
              <MetadataTree
                categories={facets.data.categories}
                years={facets.data.years}
                fileTypes={facets.data.fileTypes}
                tags={facets.data.tags}
                selectedCategory={archive.category}
                selectedYear={archive.year}
                selectedFileType={archive.fileType}
                onCategorySelect={(c) => archive.setCategory(c)}
                onYearSelect={(y) => archive.setYear(y)}
                onFileTypeSelect={(t) =>
                  archive.setFileType(
                    (t as "pdf" | "doc" | "xls" | "img" | "other" | null) ?? null
                  )
                }
                special={{
                  needsReview: {
                    active: archive.needsReview,
                    count: facets.data.needsReviewCount,
                    onToggle: () => archive.setNeedsReview(!archive.needsReview),
                  },
                  unclassified: {
                    active: archive.unclassifiedOnly,
                    count: facets.data.unclassifiedCount,
                    onToggle: () =>
                      archive.setUnclassifiedOnly(!archive.unclassifiedOnly),
                  },
                }}
              />
            ) : null}
          </div>
        </aside>

        {/* Center: results */}
        <section className="flex min-w-0 flex-col gap-4">
          {/* Result header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-[15px] font-bold text-ink-strong">
                النتائج
              </h2>
              <span className="font-mono text-[12.5px] text-ink-soft tnum">
                {refined.length.toLocaleString("ar-SA")}
                {total !== refined.length && (
                  <span className="ms-1 text-ink-soft">
                    من أصل {total.toLocaleString("ar-SA")}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ResultVariantSwitcher
                variant={variant}
                onChange={setVariant}
                open={variantOpen}
                setOpen={setVariantOpen}
              />
            </div>
          </div>

          {list.isLoading ? (
            <Loading label="جاري تحميل المستندات..." />
          ) : refined.length === 0 ? (
            <EmptyState
              icon={<SlidersHorizontal className="h-4 w-4 text-oud" aria-hidden="true" />}
              title="لا توجد مستندات في النطاق الحالي"
              description="جرّب توسيع الفلاتر أو مسحها للعودة إلى العرض الكامل."
              action={
                archive.activeFilterCount > 0 ? (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => archive.clearAll()}
                    leadingIcon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    مسح كل الفلاتر
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={onOpenUpload}
                    leadingIcon={<ArchiveIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    ابدأ برفع أول مستند
                  </Button>
                )
              }
            />
          ) : (
            <ResultsGrid
              items={paginated}
              variant={variant}
              onOpen={onOpenDocument}
              onSelect={(id) => archive.setSelectedDocumentId(id)}
              activeId={archive.selectedDocumentId}
              onCategoryClick={(c) => archive.setCategory(c)}
              onTagClick={(t) => archive.setNameQuery(t)}
            />
          )}
        </section>

        {/* Right: preview drawer placeholder (the drawer is fixed-positioned) */}
        <div className="hidden xl:block xl:w-0" aria-hidden="true" />
      </div>

      {/* Preview drawer (anchored) */}
      <PreviewDrawer
        item={selectedItem}
        related={related}
        onClose={() => archive.setSelectedDocumentId(null)}
        onOpenGraph={(id) => archive.setGraphOpenFor(id)}
        onCategoryClick={(c) => archive.setCategory(c)}
        onTagClick={(t) => archive.setNameQuery(t)}
        onDocumentOpen={onOpenDocument}
      />

      {/* Local graph drawer */}
      <LocalGraphDrawer
        seed={graphSeed}
        pool={refined}
        onClose={() => archive.setGraphOpenFor(null)}
        onOpenDocument={onOpenDocument}
        onCategoryClick={(c) => archive.setCategory(c)}
        onTagClick={(t) => archive.setNameQuery(t)}
      />
    </div>
  );
}

/* ─────────────── Helpers ─────────────── */

function classifyType(name: string): "pdf" | "doc" | "xls" | "img" | "other" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "doc";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "xls";
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    return "img";
  return "other";
}

function sortByRecent(items: ArchiveItem[]): ArchiveItem[] {
  return [...items].sort((a, b) => {
    const da = Date.parse(a.uploadedAtUtc);
    const db = Date.parse(b.uploadedAtUtc);
    if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
    return db - da;
  });
}

/* ─────────────── Results grid ─────────────── */

interface ResultsGridProps {
  items: ArchiveItem[];
  variant: RowVariant;
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
  activeId: string | null;
  onCategoryClick: (c: string) => void;
  onTagClick: (t: string) => void;
}

function ResultsGrid({
  items,
  variant,
  onOpen,
  onSelect,
  activeId,
  onCategoryClick,
  onTagClick,
}: ResultsGridProps): JSX.Element {
  if (variant === "card") {
    return (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <DocumentRow
            key={item.documentId}
            item={item}
            variant="card"
            active={item.documentId === activeId}
            onOpen={(id) => {
              onSelect(id);
              onOpen(id);
            }}
            onCategoryClick={onCategoryClick}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    );
  }
  if (variant === "row") {
    return (
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <DocumentRow
            key={item.documentId}
            item={item}
            variant="row"
            active={item.documentId === activeId}
            onOpen={(id) => {
              onSelect(id);
              onOpen(id);
            }}
            onCategoryClick={onCategoryClick}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <DocumentRow
          key={item.documentId}
          item={item}
          variant="compact"
          active={item.documentId === activeId}
          onOpen={(id) => {
            onSelect(id);
            onOpen(id);
          }}
          onCategoryClick={onCategoryClick}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  );
}

/* ─────────────── Variant switcher ─────────────── */

function ResultVariantSwitcher({
  variant,
  onChange,
  open,
  setOpen,
}: {
  variant: RowVariant;
  onChange: (v: RowVariant) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}): JSX.Element {
  const opts: Array<{ id: RowVariant; label: string; Icon: typeof LayoutGrid }> = [
    { id: "card", label: "بطاقات", Icon: LayoutGrid },
    { id: "row", label: "قائمة", Icon: Rows3 },
    { id: "compact", label: "مضغوط", Icon: List },
  ];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-paper px-2.5 text-[12.5px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:border-border-strong hover:text-ink"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {(() => {
          const o = opts.find((x) => x.id === variant)!;
          return (
            <>
              <o.Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {o.label}
              <ChevronDown className="h-3 w-3 text-ink-soft" aria-hidden="true" />
            </>
          );
        })()}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute end-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-paper p-1 shadow-pop animate-fade-in"
        >
          {opts.map((o) => (
            <li key={o.id} role="option" aria-selected={variant === o.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-180 ease-out-expo ${
                  variant === o.id
                    ? "bg-palm-50 text-palm-700"
                    : "text-ink-muted hover:bg-cream-soft hover:text-ink"
                }`}
              >
                <o.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
