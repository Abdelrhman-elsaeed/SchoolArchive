import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button — production-grade.
 *
 *  - Solid fills (no gradients).
 *  - 5 variants × 3 sizes × icon slots × loading.
 *  - Active scale 0.985, focus ring always visible.
 *  - Hit-target ≥ 40 px tall for `md` and `lg`.
 */
export type ButtonVariant =
  | "primary"     // Solid Date Palm Green
  | "secondary"   // Paper surface, ink border
  | "ghost"       // Transparent
  | "tan"         // Solid Diriyah Tan
  | "ink"         // Solid Ink Navy
  | "danger"      // Solid Sadu Maroon
  | "link";       // Text-only palm link

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  block?: boolean;
  loading?: boolean;
}

const BASE =
  "relative inline-flex items-center justify-center gap-2 " +
  "font-display font-semibold " +
  "transition-[background-color,border-color,color,box-shadow,transform] " +
  "duration-180 ease-out-expo " +
  "select-none whitespace-nowrap " +
  "active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 " +
  "disabled:active:scale-100";

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-md",
  md: "h-11 px-5 text-[14px] rounded-md",
  lg: "h-12 px-6 text-[15px] rounded-lg",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-palm text-white border border-palm-600 " +
    "hover:bg-palm-600 hover:border-palm-700 hover:shadow-palm",
  secondary:
    "bg-paper text-ink border border-border " +
    "hover:bg-cream-soft hover:border-border-strong",
  ghost:
    "bg-transparent text-ink-muted border border-transparent " +
    "hover:bg-cream-soft hover:text-ink",
  tan:
    "bg-tan text-ink-strong border border-tan-400 " +
    "hover:bg-tan-400 hover:shadow-tan",
  ink:
    "bg-ink text-white border border-ink-strong " +
    "hover:bg-ink-strong",
  danger:
    "bg-maroon text-white border border-maroon-600 " +
    "hover:bg-maroon-600",
  link:
    "bg-transparent text-palm border border-transparent px-0 h-auto rounded-none " +
    "hover:text-palm-700 hover:underline underline-offset-4 " +
    "decoration-tan decoration-1",
};

export function Button({
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  block = false,
  loading = false,
  className = "",
  children,
  disabled,
  type,
  ...rest
}: ButtonProps): JSX.Element {
  const isLink = variant === "link";
  const classes = [
    BASE,
    isLink ? "" : SIZE[size],
    VARIANT[variant],
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {leadingIcon && <span className="shrink-0">{leadingIcon}</span>}
      <span className="truncate">{children}</span>
      {trailingIcon && <span className="shrink-0">{trailingIcon}</span>}
    </button>
  );
}
