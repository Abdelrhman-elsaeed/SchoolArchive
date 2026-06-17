interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  rounded?: "xs" | "sm" | "md" | "lg" | "xl" | "full";
}

const ROUNDED: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  xs: "rounded-xs",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

export function Skeleton({
  className = "",
  width = "w-full",
  height = "h-4",
  rounded = "md",
}: SkeletonProps): JSX.Element {
  return (
    <div
      className={`asa-skeleton ${width} ${height} ${ROUNDED[rounded]} ${className}`}
      aria-hidden="true"
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({
  lines = 3,
  className = "",
}: SkeletonTextProps): JSX.Element {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="h-3.5"
          width={i === lines - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}
