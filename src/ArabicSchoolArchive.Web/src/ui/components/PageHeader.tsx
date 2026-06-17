import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  /** Small kufi-tracked eyebrow above the title. */
  kicker?: string;
  /** Display-grade title. */
  title: string;
  /** Optional supporting paragraph (string or rich node). */
  description?: ReactNode;
  /** Optional breadcrumb trail (rendered above the kicker). */
  crumbs?: Crumb[];
  /** Right-side actions (buttons, segmented control, etc.). */
  actions?: ReactNode;
  /** Optional right-side stat strip (rendered below the actions row). */
  stats?: ReactNode;
  className?: string;
}

/**
 * PageHeader — single source of truth for the top of every page.
 * Provides a real, large display-grade typographic moment, a breadcrumb,
 * a kufi kicker, and an actions slot. Eliminates the "single line +
 * tiny description" feel of the previous heading.
 */
export function PageHeader({
  kicker,
  title,
  description,
  crumbs,
  actions,
  stats,
  className = "",
}: PageHeaderProps): JSX.Element {
  return (
    <header className={`flex flex-col gap-6 ${className}`}>
      {(crumbs?.length ?? 0) > 0 && (
        <nav
          aria-label="مسار التنقل"
          className="flex items-center gap-1.5 text-[12.5px] text-ink-soft"
        >
          {crumbs!.map((c, i) => {
            const last = i === crumbs!.length - 1;
            return (
              <span key={i} className="flex items-center gap-1.5">
                {c.href && !last ? (
                  <a
                    href={c.href}
                    className="transition-colors duration-180 ease-out-expo hover:text-ink"
                  >
                    {c.label}
                  </a>
                ) : (
                  <span className={last ? "font-semibold text-ink" : ""}>
                    {c.label}
                  </span>
                )}
                {!last && (
                  <ChevronLeft
                    className="h-3.5 w-3.5 text-ink-soft"
                    aria-hidden="true"
                  />
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          {kicker && (
            <div className="asa-kicker mb-3 inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-px w-6 bg-tan" />
              {kicker}
            </div>
          )}
          <h1 className="font-display text-[2rem] font-bold leading-[1.1] tracking-tight text-ink-strong sm:text-[2.25rem] lg:text-[2.5rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
              {description}
            </p>
          )}
          <div
            aria-hidden="true"
            className="mt-5 h-1 w-16 rounded-full bg-gradient-to-l from-palm to-tan"
          />
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {stats && <div className="flex flex-wrap items-stretch gap-3">{stats}</div>}
    </header>
  );
}

interface PageStatProps {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "palm" | "tan" | "ink" | "oud" | "maroon";
  icon?: ReactNode;
}

const STAT_TONE: Record<NonNullable<PageStatProps["tone"]>, string> = {
  neutral: "border-border bg-paper text-ink-strong",
  palm: "border-palm-200 bg-palm-50 text-palm-700",
  tan: "border-tan-200 bg-tan-50 text-ink-strong",
  ink: "border-navy-100 bg-navy-50 text-ink-strong",
  oud: "border-oud-100 bg-oud-50 text-ink-strong",
  maroon: "border-maroon-200 bg-maroon-50 text-maroon-700",
};

export function PageStat({
  label,
  value,
  tone = "neutral",
  icon,
}: PageStatProps): JSX.Element {
  return (
    <div
      className={`flex min-w-[160px] flex-1 items-center gap-3 rounded-lg border px-4 py-3 ${STAT_TONE[tone]}`}
    >
      {icon && (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-paper border border-border"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {label}
        </div>
        <div className="mt-0.5 font-display text-[18px] font-bold tnum text-ink-strong">
          {value}
        </div>
      </div>
    </div>
  );
}
