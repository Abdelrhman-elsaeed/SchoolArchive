import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

/**
 * Calm, editorial empty state. Strong tan halo behind a palm icon.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps): JSX.Element {
  return (
    <div className="asa-card relative flex flex-col items-center gap-3 px-6 py-14 text-center animate-fade-in">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-tan-100"
        />
        <div
          aria-hidden="true"
          className="absolute inset-2 rounded-full border border-tan-200"
        />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-paper border border-border">
          {icon ?? <Inbox className="h-4 w-4 text-oud" aria-hidden="true" />}
        </div>
      </div>
      <div className="max-w-sm">
        <div className="font-display text-[17px] font-bold text-ink-strong">
          {title}
        </div>
        {description && (
          <div className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            {description}
          </div>
        )}
      </div>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
