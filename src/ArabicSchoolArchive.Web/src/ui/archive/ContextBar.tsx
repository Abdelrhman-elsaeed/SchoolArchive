import type { ReactNode } from "react";
import { ChevronLeft, Home } from "lucide-react";

export interface Crumb {
  id: string;
  label: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Visual emphasis (e.g. the current page). */
  current?: boolean;
}

interface ContextBarProps {
  crumbs: Crumb[];
  right?: ReactNode;
  className?: string;
}

/**
 * Premium context bar. Always shows:
 *  - home anchor
 *  - parents (clickable, hover only deepens colour, never underlines)
 *  - current segment (semibold ink-strong)
 *  - right-side meta (e.g. active view indicator, layout switcher)
 */
export function ContextBar({
  crumbs,
  right,
  className = "",
}: ContextBarProps): JSX.Element {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 text-[12.5px] ${className}`}
    >
      <nav
        aria-label="مسار السياق"
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        <a
          href="#/upload"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
          aria-label="الرئيسية"
          title="الرئيسية"
        >
          <Home className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const interactive = !last && (!!c.onClick || !!c.href);
          const inner = (
            <span
              className={
                c.current || last
                  ? "font-semibold text-ink-strong"
                  : "text-ink-muted transition-colors duration-180 ease-out-expo"
              }
            >
              {c.label}
            </span>
          );
          return (
            <span key={c.id} className="flex min-w-0 items-center gap-1.5">
              <ChevronLeft
                className="h-3.5 w-3.5 text-ink-soft"
                aria-hidden="true"
              />
              {interactive ? (
                c.href ? (
                  <a
                    href={c.href}
                    onClick={(e) => {
                      if (c.onClick) {
                        e.preventDefault();
                        c.onClick();
                      }
                    }}
                    className="rounded-sm px-1 py-0.5 transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
                  >
                    {inner}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={c.onClick}
                    className="rounded-sm px-1 py-0.5 transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
                  >
                    {inner}
                  </button>
                )
              ) : (
                <span className="rounded-sm px-1 py-0.5">{inner}</span>
              )}
            </span>
          );
        })}
      </nav>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
