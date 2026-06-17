import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileType,
  Calendar,
  Tag as TagIcon,
  HardDrive,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Share2,
} from "lucide-react";
import type { ArchiveItem } from "../../api/contracts";
import { formatBytes, formatRelativeDate } from "../components/DocumentCard";

export type RowVariant = "card" | "row" | "compact";

interface DocumentRowProps {
  item: ArchiveItem;
  variant: RowVariant;
  active?: boolean;
  onOpen: (id: string) => void;
  onCategoryClick?: (cat: string) => void;
  onTagClick?: (tag: string) => void;
}

interface FileKindMeta {
  Icon: typeof FileText;
  tileBg: string;
  tileText: string;
  tileBorder: string;
  typeLabel: string;
  extension: string;
}

export function fileTypeMeta(name: string): FileKindMeta {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf"))
    return {
      Icon: FileText,
      tileBg: "bg-maroon-50",
      tileText: "text-maroon-500",
      tileBorder: "border-maroon-200",
      typeLabel: "PDF",
      extension: ".pdf",
    };
  if (lower.endsWith(".docx") || lower.endsWith(".doc"))
    return {
      Icon: FileType,
      tileBg: "bg-navy-50",
      tileText: "text-navy-500",
      tileBorder: "border-navy-100",
      typeLabel: "Word",
      extension: ".docx",
    };
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls"))
    return {
      Icon: FileSpreadsheet,
      tileBg: "bg-palm-50",
      tileText: "text-palm-600",
      tileBorder: "border-palm-200",
      typeLabel: "Excel",
      extension: ".xlsx",
    };
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    return {
      Icon: FileImage,
      tileBg: "bg-oud-50",
      tileText: "text-oud",
      tileBorder: "border-oud-100",
      typeLabel: "صورة",
      extension: lower.endsWith(".png") ? ".png" : ".jpg",
    };
  return {
    Icon: FileText,
    tileBg: "bg-cream-soft",
    tileText: "text-oud",
    tileBorder: "border-border",
    typeLabel: "ملف",
    extension: "",
  };
}

const baseRowClass =
  "group relative flex items-center gap-3 transition-all duration-180 ease-out-expo " +
  "active:scale-[0.998] focus-within:ring-2 focus-within:ring-palm/30";

export function DocumentRow({
  item,
  variant,
  active = false,
  onOpen,
  onCategoryClick,
  onTagClick,
}: DocumentRowProps): JSX.Element {
  const { Icon, tileBg, tileText, tileBorder, typeLabel, extension } =
    fileTypeMeta(item.originalName);
  const title = item.displayName ?? item.originalName;
  const showSubtitle = !!item.displayName && item.displayName !== item.originalName;

  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={() => onOpen(item.documentId)}
        aria-current={active ? "true" : undefined}
        className={`${baseRowClass} flex-col items-stretch gap-0 overflow-hidden rounded-lg border bg-paper text-start transition-shadow duration-220 ease-out-expo hover:-translate-y-0.5 hover:shadow-lift ${
          active
            ? "border-palm ring-palm-strong"
            : "border-border hover:border-palm-200"
        }`}
      >
        <div
          aria-hidden="true"
          className="h-1 w-full bg-gradient-to-l from-palm via-tan to-tan-400"
        />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border ${tileBg} ${tileText} ${tileBorder}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="inline-flex h-6 items-center rounded-md border border-border bg-paper px-2 text-[11px] font-semibold text-ink-muted">
                {typeLabel}
              </span>
              {item.displayName && (
                <span className="inline-flex h-6 items-center gap-1 rounded-md border border-tan-200 bg-tan-50 px-2 text-[11px] font-semibold text-tan-700">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  AI
                </span>
              )}
              {item.needsReview && (
                <span className="inline-flex h-6 items-center gap-1 rounded-md border border-maroon-200 bg-maroon-50 px-2 text-[11px] font-semibold text-maroon-600">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  مراجعة
                </span>
              )}
              <span className="inline-flex h-6 items-center rounded-md border border-navy-100 bg-navy-50 px-2 font-mono text-[11px] font-semibold text-ink-strong tnum">
                {item.processingYear}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <h3
              className={`line-clamp-2 font-display text-[14.5px] font-bold leading-snug ${
                active ? "text-palm-700" : "text-ink-strong"
              }`}
            >
              {title}
            </h3>
            {showSubtitle && (
              <p
                className="mt-0.5 truncate text-[11.5px] text-ink-soft ltr-mono"
                dir="ltr"
              >
                {item.originalName}
              </p>
            )}
          </div>
          {(item.tags ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(item.tags ?? [])
                .slice(0, 3)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick?.(t);
                    }}
                    className="inline-flex h-5 items-center rounded-md border border-border bg-cream-soft px-1.5 text-[10.5px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:border-palm-200 hover:bg-palm-50 hover:text-palm-700"
                  >
                    #{t}
                  </button>
                ))}
              {(item.tags ?? []).length > 3 && (
                <span className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  +{(item.tags ?? []).length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border bg-cream-soft/60 px-4 py-2 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="tnum">{formatRelativeDate(item.uploadedAtUtc)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <HardDrive className="h-3 w-3" aria-hidden="true" />
            <span className="tnum">{formatBytes(item.sizeBytes)}</span>
          </span>
          {item.category ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCategoryClick?.(item.category!);
              }}
              className="inline-flex max-w-[120px] items-center gap-1 rounded-sm px-1 text-palm-700 transition-colors duration-180 ease-out-expo hover:bg-paper hover:text-palm"
            >
              <TagIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate font-semibold">{item.category}</span>
            </button>
          ) : (
            <span className="text-ink-soft">—</span>
          )}
        </div>
        {extension && (
          <span
            className="pointer-events-none absolute end-3 bottom-10 rounded-sm border border-border bg-paper px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider text-ink-soft opacity-0 transition-opacity duration-180 ease-out-expo group-hover:opacity-100"
            dir="ltr"
          >
            {extension}
          </span>
        )}
      </button>
    );
  }

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={() => onOpen(item.documentId)}
        aria-current={active ? "true" : undefined}
        className={`${baseRowClass} w-full rounded-md border px-3 py-2.5 text-start ${
          active
            ? "border-palm-200 bg-palm-50/60"
            : "border-border bg-paper hover:border-palm-200 hover:bg-cream-soft/50"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${tileBg} ${tileText} ${tileBorder}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={`truncate font-display text-[13.5px] font-bold ${
                active ? "text-palm-700" : "text-ink-strong"
              }`}
            >
              {title}
            </span>
            {item.displayName && (
              <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-tan-200 bg-tan-50 px-1.5 text-[10px] font-semibold text-tan-700">
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                AI
              </span>
            )}
            {item.needsReview && (
              <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-maroon-200 bg-maroon-50 px-1.5 text-[10px] font-semibold text-maroon-600">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                مراجعة
              </span>
            )}
          </span>
          {showSubtitle && (
            <span
              className="block truncate text-[11px] text-ink-soft ltr-mono"
              dir="ltr"
            >
              {item.originalName}
            </span>
          )}
        </span>
        <span className="hidden items-center gap-3 text-[11.5px] text-ink-muted sm:inline-flex">
          {item.category && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCategoryClick?.(item.category!);
              }}
              className="inline-flex items-center gap-1 rounded-sm px-1 text-palm-700 transition-colors duration-180 ease-out-expo hover:bg-paper hover:text-palm"
            >
              <TagIcon className="h-3 w-3" aria-hidden="true" />
              <span className="max-w-[120px] truncate font-semibold">
                {item.category}
              </span>
            </button>
          )}
          <span className="font-mono tnum text-ink-muted">
            {item.processingYear}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="tnum">{formatRelativeDate(item.uploadedAtUtc)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <HardDrive className="h-3 w-3" aria-hidden="true" />
            <span className="tnum">{formatBytes(item.sizeBytes)}</span>
          </span>
        </span>
        <ExternalLink
          className="h-3.5 w-3.5 shrink-0 text-ink-soft opacity-0 transition-opacity duration-180 ease-out-expo group-hover:opacity-100"
          aria-hidden="true"
        />
      </button>
    );
  }

  // compact
  return (
    <button
      type="button"
      onClick={() => onOpen(item.documentId)}
      aria-current={active ? "true" : undefined}
      title={title}
      className={`${baseRowClass} w-full items-center rounded-sm border px-2 py-1.5 text-start ${
        active
          ? "border-palm-200 bg-palm-50/60"
          : "border-transparent hover:border-border-soft hover:bg-cream-soft/60"
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${tileText}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-strong">
        {title}
      </span>
      {item.needsReview && (
        <AlertTriangle
          className="h-3 w-3 text-maroon-500"
          aria-hidden="true"
        />
      )}
      <span className="font-mono text-[10px] text-ink-soft tnum">
        {item.processingYear}
      </span>
      <span className="hidden text-[10.5px] text-ink-soft tnum sm:inline">
        {formatBytes(item.sizeBytes)}
      </span>
      {item.category && (
        <span className="hidden text-[10.5px] text-palm-700 sm:inline">
          #{item.category}
        </span>
      )}
    </button>
  );
}

export { Sparkles, Share2 };
