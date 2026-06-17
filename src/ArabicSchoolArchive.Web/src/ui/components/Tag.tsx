import type { ReactNode } from "react";

export type TagTone =
  | "neutral"
  | "palm"
  | "tan"
  | "ink"
  | "oud"
  | "maroon"
  | "outline";

interface TagProps {
  children: ReactNode;
  tone?: TagTone;
  leadingIcon?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}

const TONE: Record<TagTone, string> = {
  neutral:
    "bg-cream-soft text-ink border-border",
  palm: "bg-palm text-white border-palm-600",
  tan: "bg-tan text-ink-strong border-tan-400",
  ink: "bg-ink text-white border-ink-strong",
  oud: "bg-oud text-white border-oud",
  maroon: "bg-maroon text-white border-maroon-600",
  outline: "bg-transparent text-ink border-border",
};

const SIZE = {
  sm: "h-6 px-2 text-[11px] rounded-md",
  md: "h-7 px-2.5 text-[12px] rounded-md",
};

export function Tag({
  children,
  tone = "neutral",
  leadingIcon,
  className = "",
  size = "md",
}: TagProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border font-semibold ${SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {leadingIcon && <span className="shrink-0">{leadingIcon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}
