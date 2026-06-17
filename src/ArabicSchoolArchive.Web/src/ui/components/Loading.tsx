import { Skeleton, SkeletonText } from "./Skeleton";

interface LoadingProps {
  label?: string;
  variant?: "block" | "inline";
}

export function Loading({
  label,
  variant = "block",
}: LoadingProps): JSX.Element {
  if (variant === "inline") {
    return (
      <div
        className="flex items-center gap-2 text-[13px] text-ink-muted"
        role="status"
        aria-live="polite"
      >
        <span className="asa-skeleton h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        <span>{label ?? "جاري التحميل..."}</span>
      </div>
    );
  }
  return (
    <div
      className="asa-card flex flex-col gap-4 p-5 animate-fade-in"
      role="status"
      aria-live="polite"
    >
      {label && (
        <div className="flex items-center gap-2">
          <span className="asa-skeleton h-2 w-2 rounded-full" aria-hidden="true" />
          <span className="text-[13px] font-semibold text-ink-muted">
            {label}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Skeleton width="w-10" height="h-10" rounded="md" />
        <div className="flex-1">
          <SkeletonText lines={2} />
        </div>
      </div>
    </div>
  );
}
