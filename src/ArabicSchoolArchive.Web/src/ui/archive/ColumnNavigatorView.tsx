import { useEffect, useMemo, useState } from "react";
import {
  Layers,
  Calendar,
  FileText,
  ChevronLeft,
  Hash,
  X,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { useArchiveList } from "../../api/hooks/useArchives";
import { useArchiveFacets, getMonthNameAr } from "../../api/hooks/useArchiveFacets";
import type { ListArchivesQuery } from "../../api/ArchiveService";
import type { ArchiveItem } from "../../api/contracts";
import { Input, Button } from "../components";
import { fileTypeMeta } from "./DocumentRow";
import { useArchiveContext } from "./useArchiveContext";
import { formatBytes, formatRelativeDate } from "../components/DocumentCard";

interface ColumnNavigatorViewProps {
  onOpenDocument: (id: string) => void;
}

type Column = 0 | 1 | 2 | 3;

export function ColumnNavigatorView({
  onOpenDocument,
}: ColumnNavigatorViewProps): JSX.Element {
  const archive = useArchiveContext();

  // Build the local page query. The column navigator is a *browsing* tool,
  // so it works from the broad facet data set rather than the search query.
  const query: ListArchivesQuery = useMemo(
    () => ({
      page: 1,
      pageSize: 200,
      originalNameContains: archive.nameQuery || undefined,
    }),
    [archive.nameQuery]
  );
  const list = useArchiveList(query);
  const facets = useArchiveFacets({ page: 1, pageSize: 200 });

  // Local selection state (per-column)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Reset downstream when upstream changes
  useEffect(() => {
    setSelectedYear(null);
    setSelectedMonth(null);
    setSelectedDocId(null);
  }, [selectedCategory]);
  useEffect(() => {
    setSelectedMonth(null);
    setSelectedDocId(null);
  }, [selectedYear]);
  useEffect(() => {
    setSelectedDocId(null);
  }, [selectedMonth]);

  // The right-most column selection should also reflect the global
  // selectedDocumentId for consistency.
  useEffect(() => {
    if (archive.selectedDocumentId) setSelectedDocId(archive.selectedDocumentId);
  }, [archive.selectedDocumentId]);
  useEffect(() => {
    if (selectedDocId) archive.setSelectedDocumentId(selectedDocId);
  }, [selectedDocId, archive]);

  // Documents in this column view
  const documents = useMemo<ArchiveItem[]>(() => {
    let items = list.data?.items ?? [];
    if (selectedCategory) {
      items = items.filter((it) => it.category === selectedCategory);
    }
    if (selectedYear) {
      items = items.filter((it) => it.processingYear === selectedYear);
    }
    if (selectedMonth) {
      items = items.filter((it) => it.processingMonth === selectedMonth);
    }
    return items;
  }, [list.data, selectedCategory, selectedYear, selectedMonth]);

  const selectedDoc = useMemo<ArchiveItem | null>(
    () => documents.find((d) => d.documentId === selectedDocId) ?? null,
    [documents, selectedDocId]
  );

  // Build year/month groups dynamically
  const yearGroups = useMemo(() => {
    if (!selectedCategory) return [];
    const counts = new Map<number, number>();
    for (const it of list.data?.items ?? []) {
      if (it.category === selectedCategory) {
        counts.set(it.processingYear, (counts.get(it.processingYear) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);
  }, [list.data, selectedCategory]);

  const categories = facets.data?.categories ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Header / search */}
      <div className="asa-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0">
            <Input
              leadingIcon={<FileText className="h-4 w-4" aria-hidden="true" />}
              type="search"
              value={archive.nameQuery}
              onChange={(e) => archive.setNameQuery(e.target.value)}
              placeholder="ابحث بالاسم داخل الأعمدة…"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-kufi text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
              عرض الأعمدة
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => archive.setLayout("explorer")}
            >
              العودة للاستكشاف الذكي
            </Button>
          </div>
        </div>
        <ColumnBreadcrumb
          category={selectedCategory}
          year={selectedYear}
          month={selectedMonth}
          onResetCategory={() => setSelectedCategory(null)}
          onResetYear={() => setSelectedYear(null)}
          onResetMonth={() => setSelectedMonth(null)}
        />
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Column
          index={0}
          icon={<Layers className="h-3.5 w-3.5" aria-hidden="true" />}
          title="التصنيف"
          sub={selectedCategory ? "محدد" : "اختر تصنيفًا"}
          isLoading={facets.isLoading}
          isEmpty={categories.length === 0}
          emptyMessage="لا توجد تصنيفات في النطاق الحالي"
        >
          <ColumnList>
            {categories.map((c) => (
              <ColumnRow
                key={c.name}
                active={c.name === selectedCategory}
                label={c.name}
                count={c.count}
                onClick={() =>
                  setSelectedCategory(selectedCategory === c.name ? null : c.name)
                }
              />
            ))}
          </ColumnList>
        </Column>

        <Column
          index={1}
          icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />}
          title="السنة"
          sub={selectedYear ? String(selectedYear) : "اختر سنة"}
          isLoading={false}
          isEmpty={!selectedCategory}
          emptyMessage={
            selectedCategory
              ? "لا توجد سنوات ضمن هذا التصنيف"
              : "اختر تصنيفًا أولاً"
          }
          dim={!selectedCategory}
        >
          <ColumnList>
            {yearGroups.map((y) => (
              <ColumnRow
                key={y.year}
                active={y.year === selectedYear}
                label={String(y.year)}
                count={y.count}
                mono
                onClick={() =>
                  setSelectedYear(selectedYear === y.year ? null : y.year)
                }
              />
            ))}
          </ColumnList>
        </Column>

        <Column
          index={2}
          icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
          title="المستندات"
          sub={
            selectedDocId
              ? documents.find((d) => d.documentId === selectedDocId)?.displayName ??
                documents.find((d) => d.documentId === selectedDocId)?.originalName ??
                "مستند محدد"
              : selectedYear
              ? `${documents.length} مستند`
              : "اختر شهرًا"
          }
          isLoading={list.isLoading}
          isEmpty={!selectedYear}
          emptyMessage={
            selectedYear
              ? "لا توجد مستندات في هذا النطاق"
              : "اختر سنة لرؤية المستندات"
          }
          dim={!selectedYear}
        >
          <ColumnList compact>
            {documents.map((d) => {
              const meta = fileTypeMeta(d.originalName);
              return (
                <button
                  key={d.documentId}
                  type="button"
                  onClick={() => setSelectedDocId(d.documentId)}
                  className={`group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-start transition-all duration-180 ease-out-expo ${
                    d.documentId === selectedDocId
                      ? "border-palm-200 bg-palm-50"
                      : "border-transparent hover:border-border-soft hover:bg-cream-soft/60"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border ${meta.tileBg} ${meta.tileText} ${meta.tileBorder}`}
                  >
                    <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink-strong group-hover:text-palm-700">
                      {d.displayName ?? d.originalName}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10.5px] text-ink-soft">
                      {d.category && <span className="text-palm-700">#{d.category}</span>}
                      <span className="font-mono tnum">{d.processingYear}</span>
                      <span className="font-mono tnum">
                        {formatBytes(d.sizeBytes)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </ColumnList>
        </Column>

        <Column
          index={3}
          icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          title="المعاينة"
          sub={selectedDoc ? "تفاصيل" : "لم يتم الاختيار"}
          isLoading={false}
          isEmpty={!selectedDoc}
          emptyMessage="اختر مستندًا من العمود السابق لرؤية تفاصيله."
          dim={!selectedDoc}
        >
          {selectedDoc ? (
            <PreviewColumnBody
              item={selectedDoc}
              onOpen={() => onOpenDocument(selectedDoc.documentId)}
              onClose={() => setSelectedDocId(null)}
            />
          ) : null}
        </Column>
      </div>
    </div>
  );
}

/* ─────────────── Column shell ─────────────── */

interface ColumnProps {
  index: Column;
  icon: React.ReactNode;
  title: string;
  sub: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  dim?: boolean;
  children: React.ReactNode;
}

function Column({
  index,
  icon,
  title,
  sub,
  isLoading,
  isEmpty,
  emptyMessage,
  dim,
  children,
}: ColumnProps): JSX.Element {
  return (
    <section
      className={`asa-card relative flex min-h-[460px] flex-col overflow-hidden animate-fade-in ${
        dim ? "opacity-70" : ""
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-cream-soft/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-paper text-ink-muted">
            {icon}
          </span>
          <div className="flex flex-col">
            <span className="font-kufi text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
              {`العمود ${index + 1}`} · {title}
            </span>
            <span className="truncate text-[12.5px] font-semibold text-ink-strong">
              {sub}
            </span>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-[12.5px] text-ink-soft">
            <span className="asa-skeleton h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            جاري التحميل…
          </div>
        ) : isEmpty ? (
          <div className="px-2 py-6 text-[12.5px] text-ink-soft">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function ColumnList({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}): JSX.Element {
  return (
    <ul className={compact ? "flex flex-col" : "flex flex-col gap-0.5"}>
      {children}
    </ul>
  );
}

interface ColumnRowProps {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  mono?: boolean;
}

function ColumnRow({
  active,
  label,
  count,
  onClick,
  mono = false,
}: ColumnRowProps): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`group flex w-full items-center justify-between gap-2 rounded-sm border px-2.5 py-2 text-start transition-all duration-180 ease-out-expo active:scale-[0.99] ${
          active
            ? "border-palm-200 bg-palm-50 text-palm-700"
            : "border-transparent text-ink-muted hover:border-border-soft hover:bg-cream-soft/60 hover:text-ink"
        }`}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-180 ${
              active ? "bg-palm" : "bg-border-strong"
            }`}
          />
          <span
            className={`truncate text-[13px] font-semibold ${
              mono ? "font-mono tnum" : "font-display"
            }`}
          >
            {label}
          </span>
        </span>
        <span
          className={`font-mono text-[10.5px] tnum ${
            active ? "text-palm-700" : "text-ink-soft"
          }`}
        >
          {count.toLocaleString("ar-SA")}
        </span>
      </button>
    </li>
  );
}

/* ─────────────── Column 4: compact preview ─────────────── */

function PreviewColumnBody({
  item,
  onOpen,
  onClose,
}: {
  item: ArchiveItem;
  onOpen: () => void;
  onClose: () => void;
}): JSX.Element {
  const meta = fileTypeMeta(item.originalName);
  const title = item.displayName ?? item.originalName;
  const showSubtitle = !!item.displayName && item.displayName !== item.originalName;
  const confidence = item.confidence != null ? Math.round(item.confidence * 100) : null;

  return (
    <div className="flex flex-col gap-3 p-3 animate-fade-in-soft">
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${meta.tileBg} ${meta.tileText} ${meta.tileBorder}`}
        >
          <meta.Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display text-[14.5px] font-bold leading-tight text-ink-strong">
            {title}
          </h3>
          {showSubtitle && (
            <p
              className="mt-0.5 truncate text-[11px] text-ink-soft ltr-mono"
              dir="ltr"
            >
              {item.originalName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-paper text-ink-soft transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
          aria-label="إغلاق المعاينة"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-6 items-center rounded-md border border-border bg-cream-soft px-2 text-[11px] font-semibold text-ink-muted">
          {meta.typeLabel}
        </span>
        <span className="inline-flex h-6 items-center rounded-md border border-navy-100 bg-navy-50 px-2 font-mono text-[11px] font-semibold text-ink-strong tnum">
          {item.processingYear}
        </span>
        {item.needsReview && (
          <span className="inline-flex h-6 items-center gap-1 rounded-md border border-maroon-200 bg-maroon-50 px-2 text-[11px] font-semibold text-maroon-600">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            مراجعة
          </span>
        )}
      </div>

      {item.summary && (
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          {item.summary}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border">
        <PreviewRow
          label="التصنيف"
          icon={<Layers className="h-3 w-3" />}
          value={item.category || "—"}
        />
        <PreviewRow
          label="السنة/الشهر"
          icon={<Calendar className="h-3 w-3" />}
          value={`${item.processingYear} · ${getMonthNameAr(item.processingMonth)}`}
        />
        <PreviewRow
          label="الحجم"
          icon={<Hash className="h-3 w-3" />}
          value={formatBytes(item.sizeBytes)}
        />
        <PreviewRow
          label="تاريخ الرفع"
          icon={<Calendar className="h-3 w-3" />}
          value={formatRelativeDate(item.uploadedAtUtc)}
        />
      </dl>

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="inline-flex h-6 items-center rounded-md border border-border bg-cream-soft px-2 text-[11px] font-semibold text-ink-muted"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {confidence != null && (
        <div>
          <div className="flex items-center justify-between text-[11px] text-ink-soft">
            <span>ثقة التحليل</span>
            <span className="font-mono tnum">{confidence}%</span>
          </div>
          <div className="mt-1.5 relative h-1 w-full overflow-hidden rounded-full bg-cream-soft">
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-palm"
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
      )}

      <Button
        variant="primary"
        size="sm"
        block
        onClick={onOpen}
        trailingIcon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        فتح المستند
      </Button>
    </div>
  );
}

function PreviewRow({
  label,
  icon,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 bg-paper px-2.5 py-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-cream-soft text-ink-soft">
        {icon}
      </span>
      <span className="font-kufi text-[10px] uppercase tracking-[0.16em] text-ink-soft">
        {label}
      </span>
      <span className="ms-auto truncate text-[12px] font-semibold text-ink-strong">
        {value}
      </span>
    </div>
  );
}

/* ─────────────── Breadcrumb ─────────────── */

function ColumnBreadcrumb({
  category,
  year,
  month,
  onResetCategory,
  onResetYear,
  onResetMonth,
}: {
  category: string | null;
  year: number | null;
  month: number | null;
  onResetCategory: () => void;
  onResetYear: () => void;
  onResetMonth: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="font-kufi text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
        المسار
      </span>
      <span className="font-semibold text-ink-strong">الأرشيف</span>
      <ChevronLeft className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
      {category ? (
        <button
          type="button"
          onClick={onResetCategory}
          className="rounded-sm px-1 text-palm-700 transition-colors duration-180 ease-out-expo hover:bg-cream-soft"
        >
          {category}
        </button>
      ) : (
        <span className="text-ink-soft">اختر تصنيفًا</span>
      )}
      {category && (
        <>
          <ChevronLeft className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
          {year != null ? (
            <button
              type="button"
              onClick={onResetYear}
              className="rounded-sm px-1 font-mono tnum text-palm-700 transition-colors duration-180 ease-out-expo hover:bg-cream-soft"
            >
              {year}
            </button>
          ) : (
            <span className="text-ink-soft">السنة</span>
          )}
        </>
      )}
      {category && year != null && (
        <>
          <ChevronLeft className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
          {month != null ? (
            <button
              type="button"
              onClick={onResetMonth}
              className="rounded-sm px-1 text-palm-700 transition-colors duration-180 ease-out-expo hover:bg-cream-soft"
            >
              {getMonthNameAr(month)}
            </button>
          ) : (
            <span className="text-ink-soft">الشهر</span>
          )}
        </>
      )}
    </div>
  );
}
