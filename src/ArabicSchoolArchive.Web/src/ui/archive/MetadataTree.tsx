import { useState, type ReactNode } from "react";
import { ChevronLeft, Tag as TagIcon, Calendar, FileText, Layers, Sparkles, AlertTriangle, FileQuestion } from "lucide-react";
import type {
  CategoryFacet,
  YearFacet,
  FileTypeFacet,
  TagFacet,
} from "../../api/hooks/useArchiveFacets";
import { fileTypeLabel } from "../../api/hooks/useArchiveFacets";

export type MetadataSectionId =
  | "categories"
  | "years"
  | "fileTypes"
  | "tags"
  | "special";

export interface SpecialSection {
  needsReview: { active: boolean; count: number; onToggle: () => void };
  unclassified: { active: boolean; count: number; onToggle: () => void };
}

interface MetadataTreeProps {
  categories: CategoryFacet[];
  years: YearFacet[];
  fileTypes: FileTypeFacet[];
  tags: TagFacet[];
  selectedCategory: string | null;
  selectedYear: number | null;
  selectedFileType: string | null;
  onCategorySelect: (cat: string | null) => void;
  onYearSelect: (year: number | null) => void;
  onFileTypeSelect: (type: string | null) => void;
  special: SpecialSection;
}

const DEFAULT_OPEN: Record<MetadataSectionId, boolean> = {
  categories: true,
  years: true,
  fileTypes: true,
  tags: false,
  special: true,
};

export function MetadataTree(props: MetadataTreeProps): JSX.Element {
  return (
    <nav
      aria-label="التنقل عبر البيانات الوصفية"
      className="flex flex-col"
    >
      <MetadataSection
        id="categories"
        title="التصنيفات"
        icon={<Layers className="h-3.5 w-3.5" aria-hidden="true" />}
        count={props.categories.length}
      >
        <CategoryList
          categories={props.categories}
          selected={props.selectedCategory}
          onSelect={props.onCategorySelect}
        />
      </MetadataSection>
      <MetadataSection
        id="years"
        title="السنوات"
        icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />}
        count={props.years.length}
      >
        <YearList
          years={props.years}
          selected={props.selectedYear}
          onSelect={props.onYearSelect}
        />
      </MetadataSection>
      <MetadataSection
        id="fileTypes"
        title="نوع الملف"
        icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
        count={props.fileTypes.length}
      >
        <FileTypeList
          fileTypes={props.fileTypes}
          selected={props.selectedFileType}
          onSelect={props.onFileTypeSelect}
        />
      </MetadataSection>
      <MetadataSection
        id="special"
        title="حالات خاصة"
        icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
        count={2}
      >
        <SpecialList special={props.special} />
      </MetadataSection>
      <MetadataSection
        id="tags"
        title="أهم الوسوم"
        icon={<TagIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        count={Math.min(props.tags.length, 14)}
      >
        <TagList tags={props.tags.slice(0, 14)} />
      </MetadataSection>
    </nav>
  );
}

/* ─────────────── Section shell with collapse/expand ─────────────── */

interface MetadataSectionProps {
  id: MetadataSectionId;
  title: string;
  icon: ReactNode;
  count: number;
  children: ReactNode;
}

function MetadataSection({
  id,
  title,
  icon,
  count,
  children,
}: MetadataSectionProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(DEFAULT_OPEN[id]);
  return (
    <div className="border-b border-border-soft last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start transition-colors duration-180 ease-out-expo hover:bg-cream-soft/60"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-paper text-ink-muted transition-colors duration-180 ease-out-expo group-hover:text-ink">
            {icon}
          </span>
          <span className="font-kufi text-[10.5px] uppercase tracking-[0.18em] text-ink-strong">
            {title}
          </span>
          {count > 0 && (
            <span className="font-mono text-[10px] text-ink-soft tnum">
              {count}
            </span>
          )}
        </span>
        <ChevronLeft
          className={`h-3.5 w-3.5 text-ink-soft transition-transform duration-180 ease-out-expo ${
            open ? "-rotate-90" : "rotate-180"
          }`}
          aria-hidden="true"
        />
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-220 ease-out-expo ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <div className="px-2 pb-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── List renderers ─────────────── */

function CategoryList({
  categories,
  selected,
  onSelect,
}: {
  categories: CategoryFacet[];
  selected: string | null;
  onSelect: (c: string | null) => void;
}): JSX.Element {
  if (categories.length === 0) {
    return <EmptyHint label="لا توجد تصنيفات ضمن هذا النطاق" />;
  }
  return (
    <ul className="flex flex-col">
      <TreeRow
        active={!selected}
        label="كل التصنيفات"
        count={categories.reduce((s, c) => s + c.count, 0)}
        onClick={() => onSelect(null)}
      />
      {categories.map((c) => (
        <TreeRow
          key={c.name}
          active={selected === c.name}
          label={c.name}
          count={c.count}
          onClick={() => onSelect(selected === c.name ? null : c.name)}
        />
      ))}
    </ul>
  );
}

function YearList({
  years,
  selected,
  onSelect,
}: {
  years: YearFacet[];
  selected: number | null;
  onSelect: (y: number | null) => void;
}): JSX.Element {
  if (years.length === 0) {
    return <EmptyHint label="لا توجد سنوات ضمن هذا النطاق" />;
  }
  return (
    <ul className="flex flex-col">
      <TreeRow
        active={!selected}
        label="كل السنوات"
        count={years.reduce((s, y) => s + y.count, 0)}
        onClick={() => onSelect(null)}
      />
      {years.map((y) => (
        <TreeRow
          key={y.year}
          active={selected === y.year}
          label={String(y.year)}
          count={y.count}
          mono
          onClick={() => onSelect(selected === y.year ? null : y.year)}
        />
      ))}
    </ul>
  );
}

function FileTypeList({
  fileTypes,
  selected,
  onSelect,
}: {
  fileTypes: FileTypeFacet[];
  selected: string | null;
  onSelect: (t: string | null) => void;
}): JSX.Element {
  if (fileTypes.length === 0) {
    return <EmptyHint label="لا توجد أنواع ملفات" />;
  }
  return (
    <ul className="flex flex-col">
      <TreeRow
        active={!selected}
        label="كل الأنواع"
        count={fileTypes.reduce((s, t) => s + t.count, 0)}
        onClick={() => onSelect(null)}
      />
      {fileTypes.map((t) => (
        <TreeRow
          key={t.type}
          active={selected === t.type}
          label={fileTypeLabel(t.type)}
          count={t.count}
          onClick={() => onSelect(selected === t.type ? null : t.type)}
        />
      ))}
    </ul>
  );
}

function TagList({ tags }: { tags: TagFacet[] }): JSX.Element {
  if (tags.length === 0) {
    return <EmptyHint label="لا توجد وسوم بعد" />;
  }
  return (
    <div className="flex flex-wrap gap-1.5 px-1 py-1">
      {tags.map((t) => (
        <span
          key={t.tag}
          className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-paper px-2 text-[11.5px] font-semibold text-ink-muted"
          title={`${t.count} مستند`}
        >
          <span className="text-ink-soft">#</span>
          <span className="truncate">{t.tag}</span>
          <span className="font-mono text-[10px] text-ink-soft tnum">
            {t.count}
          </span>
        </span>
      ))}
    </div>
  );
}

function SpecialList({
  special,
}: {
  special: SpecialSection;
}): JSX.Element {
  return (
    <ul className="flex flex-col">
      <TreeRow
        active={special.needsReview.active}
        label="يحتاج مراجعة"
        count={special.needsReview.count}
        accent="maroon"
        icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={special.needsReview.onToggle}
      />
      <TreeRow
        active={special.unclassified.active}
        label="غير مصنف"
        count={special.unclassified.count}
        accent="oud"
        icon={<FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={special.unclassified.onToggle}
      />
    </ul>
  );
}

/* ─────────────── Row primitive ─────────────── */

type Accent = "palm" | "tan" | "ink" | "oud" | "maroon";

function treeRowClass(active: boolean, accent: Accent = "palm"): string {
  if (active) {
    if (accent === "maroon")
      return "border-maroon-200 bg-maroon-50 text-maroon-600";
    if (accent === "oud") return "border-oud-100 bg-oud-50 text-oud";
    if (accent === "tan") return "border-tan-200 bg-tan-50 text-tan-700";
    if (accent === "ink") return "border-navy-100 bg-navy-50 text-ink-strong";
    return "border-palm-200 bg-palm-50 text-palm-700";
  }
  return "border-transparent text-ink-muted hover:border-border-soft hover:bg-cream-soft/60 hover:text-ink";
}

interface TreeRowProps {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  mono?: boolean;
  accent?: Accent;
  icon?: ReactNode;
}

function TreeRow({
  active,
  label,
  count,
  onClick,
  mono = false,
  accent = "palm",
  icon,
}: TreeRowProps): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`group flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-[12.5px] font-semibold transition-all duration-180 ease-out-expo active:scale-[0.99] ${treeRowClass(
          active,
          accent
        )}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon ? (
            <span className="shrink-0 opacity-90">{icon}</span>
          ) : (
            <span
              aria-hidden="true"
              className={`h-1 w-1 shrink-0 rounded-full transition-colors duration-180 ${
                active ? "bg-current" : "bg-border-strong"
              }`}
            />
          )}
          <span
            className={`truncate ${mono ? "font-mono tnum" : "font-display"}`}
          >
            {label}
          </span>
        </span>
        <span
          className={`shrink-0 font-mono text-[10.5px] tnum ${
            active ? "opacity-100" : "text-ink-soft opacity-100"
          }`}
        >
          {count.toLocaleString("ar-SA")}
        </span>
      </button>
    </li>
  );
}

function EmptyHint({ label }: { label: string }): JSX.Element {
  return (
    <div className="px-2 py-2 text-[12px] text-ink-soft">{label}</div>
  );
}
