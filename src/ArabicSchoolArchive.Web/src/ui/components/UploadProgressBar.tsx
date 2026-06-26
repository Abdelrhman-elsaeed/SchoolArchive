export type UploadProgressBarTone = "palm" | "tan" | "maroon" | "neutral" | "ink";

interface UploadProgressBarProps {
  /** Determinate progress 0–100, or null for indeterminate. */
  value: number | null;
  tone?: UploadProgressBarTone;
  size?: "sm" | "md";
  /** Optional label shown to the right of the bar (e.g. "2.4 ميغابايت / 6.1"). */
  trailingLabel?: string;
  className?: string;
}

const TONE_BG: Record<UploadProgressBarTone, string> = {
  palm: "bg-palm",
  tan: "bg-tan",
  maroon: "bg-maroon",
  neutral: "bg-oud",
  ink: "bg-ink",
};

const HEIGHT: Record<NonNullable<UploadProgressBarProps["size"]>, string> = {
  sm: "h-1",
  md: "h-1.5",
};

/**
 * Premium progress bar.
 *  - Determinate (value is a 0..100 number): fills smoothly with motion.
 *  - Indeterminate (value is null): runs a subtle sliding segment loop.
 *
 * The indeterminate loop is honest: it does not pretend to know
 * bytes-sent. It just signals "work in flight".
 */
export function UploadProgressBar({
  value,
  tone = "palm",
  size = "md",
  trailingLabel,
  className = "",
}: UploadProgressBarProps): JSX.Element {
  const isIndeterminate = value === null;
  const clamped = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className={`relative w-full overflow-hidden rounded-full bg-cream-soft ${HEIGHT[size]}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isIndeterminate ? undefined : clamped}
        aria-busy={isIndeterminate || undefined}
      >
        {isIndeterminate ? (
          <div
            aria-hidden="true"
            className={`absolute inset-y-0 w-1/3 rounded-full opacity-90 ${TONE_BG[tone]} animate-[uploadSlide_1.4s_cubic-bezier(0.22,1,0.36,1)_infinite]`}
          />
        ) : (
          <div
            aria-hidden="true"
            className={`h-full rounded-full ${TONE_BG[tone]} transition-[width] duration-320 ease-out-expo`}
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
      {trailingLabel !== undefined && (
        <span
          className="shrink-0 font-mono text-[11.5px] tracking-wide text-ink-soft tnum"
          dir="ltr"
        >
          {trailingLabel}
        </span>
      )}
      <style>{`
        @keyframes uploadSlide {
          0%   { transform: translateX(-110%); }
          100% { transform: translateX(380%); }
        }
      `}</style>
    </div>
  );
}


