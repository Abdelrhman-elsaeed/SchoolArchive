interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  variant?: "palm" | "ink" | "tan";
  className?: string;
}

/**
 * Brand mark — an abstract, geometric monogram that suggests an
 * open book / palm frond / mihrab without resorting to literal
 * heritage symbols. Strong silhouette; works as a sidebar anchor
 * and as a small favicon-style mark.
 */
export function BrandMark({
  size = "md",
  variant = "palm",
  className = "",
}: BrandMarkProps): JSX.Element {
  const dim = size === "sm" ? 24 : size === "lg" ? 44 : 36;

  const fill =
    variant === "palm"
      ? { bg: "#0E5A46", accent: "#C8A46A" }
      : variant === "ink"
        ? { bg: "#0F2236", accent: "#C8A46A" }
        : { bg: "#C8A46A", accent: "#0E5A46" };

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md ${className}`}
      aria-hidden="true"
      style={{ width: dim, height: dim }}
    >
      <svg
        viewBox="0 0 32 32"
        width={dim}
        height={dim}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="7" fill={fill.bg} />
        {/* Tan accent corner */}
        <rect x="22" y="3" width="7" height="2" rx="1" fill={fill.accent} />
        {/* Open-book arcs */}
        <path
          d="M8 22 V13 a4 4 0 0 1 4-4 h2 a4 4 0 0 1 4 4 v9"
          stroke="#FFFDF8"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M24 22 V13 a4 4 0 0 0-4-4 h-2 a4 4 0 0 0-4 4 v9"
          stroke="#FFFDF8"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        {/* Spine */}
        <line
          x1="16"
          y1="9"
          x2="16"
          y2="22"
          stroke={fill.accent}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        {/* Baseline */}
        <line
          x1="6"
          y1="25"
          x2="26"
          y2="25"
          stroke={fill.accent}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}
