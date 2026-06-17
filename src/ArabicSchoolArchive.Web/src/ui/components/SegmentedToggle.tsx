import type { ReactNode } from "react";

interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: ReactNode; icon?: ReactNode }>;
  ariaLabel?: string;
  size?: "sm" | "md";
}

/**
 * Segmented control — strong, active, no animation gimmicks.
 * Active option paints a solid palm-50 fill with ink-strong text and
 * a 1px palm border. Inactive options are paper with ink-muted text.
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
}: SegmentedToggleProps<T>): JSX.Element {
  const optHeight = size === "sm" ? "h-8 text-[12.5px]" : "h-10 text-[13px]";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-cream-soft p-1"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`inline-flex items-center gap-2 rounded-sm px-3 ${optHeight} font-semibold transition-colors duration-180 ease-out-expo ${
              active
                ? "bg-paper text-ink-strong border border-border shadow-xs"
                : "border border-transparent text-ink-muted hover:text-ink hover:bg-paper/60"
            }`}
          >
            {opt.icon}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
