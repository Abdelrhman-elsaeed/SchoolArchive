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
  ChevronLeft,
} from "lucide-react";
import type { ArchiveItem } from "../../api/contracts";
import { Tag } from "./Tag";

interface DocumentCardProps {
  item: ArchiveItem;
  onCategoryClick?: (category: string) => void;
}

interface FileKindMeta {
  Icon: typeof FileText;
  tileBg: string;
  tileText: string;
  tileBorder: string;
  typeLabel: string;
  extension: string;
}

function fileTypeMeta(name: string): FileKindMeta {
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

export function DocumentCard({ item, onCategoryClick }: DocumentCardProps): JSX.Element {
  const { Icon, tileBg, tileText, tileBorder, typeLabel, extension } =
    fileTypeMeta(item.originalName);
  const title = item.displayName ?? item.originalName;
  const showSubtitle = !!item.displayName && item.displayName !== item.originalName;
  const visibleTags = (item.tags ?? []).slice(0, 3);
  const extraTags = (item.tags ?? []).length - visibleTags.length;

  return (
    <a
      href={`#/archives/${item.documentId}`}
      className="group asa-card relative flex flex-col overflow-hidden transition-all duration-220 ease-out-expo hover:-translate-y-0.5 hover:border-palm-200 hover:shadow-lift"
    >
      {/* Top rail — palm/tan baseline (architectural mark) */}
      <div
        aria-hidden="true"
        className="h-1 w-full bg-gradient-to-l from-palm via-tan to-tan-400"
      />

      <div className="flex flex-col gap-4 p-5">
        {/* Head: icon tile + status pills */}
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md border ${tileBg} ${tileText} ${tileBorder}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Tag tone="outline" size="sm">
              {typeLabel}
            </Tag>
            {item.displayName && (
              <Tag
                tone="tan"
                size="sm"
                leadingIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}
              >
                عنوان مقترح
              </Tag>
            )}
            {item.needsReview && (
              <Tag
                tone="maroon"
                size="sm"
                leadingIcon={<AlertTriangle className="h-3 w-3" aria-hidden="true" />}
              >
                مراجعة
              </Tag>
            )}
            <Tag tone="ink" size="sm">
              {item.processingYear}
            </Tag>
          </div>
        </div>

        {/* Title block */}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display text-[15px] font-bold leading-snug text-ink-strong transition-colors duration-180 ease-out-expo group-hover:text-palm-700">
            {title}
          </h3>
          {showSubtitle && (
            <p
              className="mt-1 truncate text-[12px] text-ink-soft ltr-mono"
              dir="ltr"
            >
              {item.originalName}
            </p>
          )}
        </div>

        {/* Tag row */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map((t) => (
              <Tag key={t} tone="neutral" size="sm">
                #{t}
              </Tag>
            ))}
            {extraTags > 0 && (
              <span className="font-kufi text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
                +{extraTags}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Meta strip */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border bg-cream-soft/60 px-5 py-2.5 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tnum">
            {formatRelativeDate(item.uploadedAtUtc)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tnum">{formatBytes(item.sizeBytes)}</span>
        </span>
        {item.category ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCategoryClick?.(item.category!);
            }}
            className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-palm-700 transition-colors duration-180 ease-out-expo hover:bg-paper hover:text-palm"
          >
            <TagIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="max-w-[120px] truncate font-semibold">
              {item.category}
            </span>
          </button>
        ) : (
          <span className="text-ink-soft">—</span>
        )}
      </div>

      <ChevronLeft
        className="pointer-events-none absolute end-4 top-7 h-4 w-4 text-palm opacity-0 transition-opacity duration-180 ease-out-expo group-hover:opacity-100"
        aria-hidden="true"
      />
      {extension && (
        <span
          className="pointer-events-none absolute end-5 bottom-12 rounded-sm border border-border bg-paper px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-ink-soft opacity-0 transition-opacity duration-180 ease-out-expo group-hover:opacity-100"
          dir="ltr"
        >
          {extension}
        </span>
      )}
    </a>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Helpers (used by DocumentCard and the browse page).
 * ──────────────────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "الآن";
    if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
    if (diff < 86400 * 7) return `قبل ${Math.floor(diff / 86400)} ي`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}

export { formatBytes, formatDate, formatRelativeDate };
