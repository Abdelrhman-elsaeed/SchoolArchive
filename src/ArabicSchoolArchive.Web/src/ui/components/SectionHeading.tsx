import type { ReactNode } from "react";

interface SectionHeadingProps {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "start" | "center";
  actions?: ReactNode;
  className?: string;
  /** Show a deep ink-navy accent rule under the title (default true). */
  rule?: boolean;
}

/**
 * Editorial page heading. Strong typographic moment.
 * - kufi-tracked kicker in tan
 * - large display title in ink-strong
 * - muted description in ink-muted
 * - optional accent rule (palm → tan)
 */
export function SectionHeading({
  kicker,
  title,
  description,
  align = "start",
  actions,
  className = "",
  rule = true,
}: SectionHeadingProps): JSX.Element {
  return (
    <header
      className={`flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between ${
        align === "center" ? "sm:items-center" : ""
      } ${className}`}
    >
      <div className="min-w-0 flex-1">
        {kicker && (
          <div className="asa-kicker mb-3 inline-flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-px w-6 bg-tan" />
            {kicker}
          </div>
        )}
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink-strong sm:text-3xl lg:text-[2.25rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
        {rule && (
          <div
            aria-hidden="true"
            className="mt-5 h-1 w-16 rounded-full bg-gradient-to-l from-palm to-tan"
          />
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
