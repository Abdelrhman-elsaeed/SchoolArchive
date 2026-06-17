import type { ReactNode } from "react";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
} from "lucide-react";

export type AlertVariant = "info" | "warning" | "error" | "success";

interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
}

const VARIANT_STYLES: Record<
  AlertVariant,
  { container: string; iconWrap: string; icon: string; bar: string }
> = {
  info: {
    container: "bg-paper border-navy-100 text-ink",
    iconWrap: "bg-navy-50 border-navy-100",
    icon: "text-navy-500",
    bar: "bg-navy-500",
  },
  success: {
    container: "bg-palm-50 border-palm-200 text-ink",
    iconWrap: "bg-paper border-palm-200",
    icon: "text-palm-600",
    bar: "bg-palm-500",
  },
  warning: {
    container: "bg-tan-50 border-tan-200 text-ink",
    iconWrap: "bg-paper border-tan-200",
    icon: "text-tan-600",
    bar: "bg-tan-500",
  },
  error: {
    container: "bg-maroon-50 border-maroon-200 text-ink",
    iconWrap: "bg-paper border-maroon-200",
    icon: "text-maroon-500",
    bar: "bg-maroon-500",
  },
};

const VARIANT_ICONS: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function Alert({ variant, title, children, onDismiss }: AlertProps): JSX.Element {
  const Icon = VARIANT_ICONS[variant];
  const styles = VARIANT_STYLES[variant];
  return (
    <div
      className={`relative flex items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-xs animate-fade-in ${styles.container}`}
      role="alert"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-3 start-0 w-[3px] rounded-full ${styles.bar}`}
      />
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${styles.iconWrap}`}
      >
        <Icon className={`h-[18px] w-[18px] ${styles.icon}`} aria-hidden="true" />
      </div>
      <div className="ms-1 flex-1 min-w-0">
        {title && (
          <strong className="block text-[14px] font-semibold text-ink-strong">
            {title}
          </strong>
        )}
        <div className="mt-1 text-[14px] leading-relaxed text-ink-muted">
          {children}
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 text-ink-soft transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
          aria-label="إغلاق"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
