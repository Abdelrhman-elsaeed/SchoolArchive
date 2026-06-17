import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface ActiveFilter {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: "palm" | "tan" | "ink" | "oud" | "maroon" | "neutral";
  onRemove: () => void;
}

interface FilterPillsProps {
  filters: ActiveFilter[];
  onClearAll?: () => void;
  className?: string;
}

const TONE: Record<NonNullable<ActiveFilter["tone"]>, string> = {
  palm: "border-palm-200 bg-palm-50 text-palm-700",
  tan: "border-tan-200 bg-tan-50 text-tan-700",
  ink: "border-navy-100 bg-navy-50 text-ink-strong",
  oud: "border-oud-100 bg-oud-50 text-oud",
  maroon: "border-maroon-200 bg-maroon-50 text-maroon-600",
  neutral: "border-border bg-cream-soft text-ink-strong",
};

export function FilterPills({
  filters,
  onClearAll,
  className = "",
}: FilterPillsProps): JSX.Element {
  if (filters.length === 0) {
    return (
      <div
        className={`flex items-center gap-2 text-[12.5px] text-ink-soft ${className}`}
      >
        <span className="font-kufi text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          السياق
        </span>
        <span>عرض كامل الأرشيف</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="font-kufi text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        فلاتر نشطة
      </span>
      {filters.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={f.onRemove}
          title="إزالة هذا الفلتر"
          className={`group inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-all duration-180 ease-out-expo hover:shadow-xs active:scale-[0.985] ${
            TONE[f.tone ?? "neutral"]
          }`}
        >
          {f.icon && (
            <span className="shrink-0 opacity-90" aria-hidden="true">
              {f.icon}
            </span>
          )}
          <span className="truncate">{f.label}</span>
          <X
            className="h-3 w-3 shrink-0 opacity-60 transition-opacity duration-180 group-hover:opacity-100"
            aria-hidden="true"
          />
        </button>
      ))}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-[12px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:border-border hover:bg-cream-soft hover:text-ink"
        >
          مسح الكل
        </button>
      )}
    </div>
  );
}
