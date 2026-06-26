import {
  CheckCircle2,
  Pause,
  Play,
  RefreshCw,
  X,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import type { UploadItem } from "../../state/useUploadQueue";
import { getStatusMeta } from "../upload/statusMeta";
import { Button } from "./Button";
import { Tag } from "./Tag";
import { UploadProgressBar } from "./UploadProgressBar";

interface UploadCurrentActivityProps {
  currentItem: UploadItem | null;
  /** 1-based index of the current file in the active batch (or null when idle). */
  currentIndex: number | null;
  /** Total files in the active batch. */
  batchSize: number;
  /** True when the queue is running. */
  isActive: boolean;
  /** Number of files already resolved. */
  doneCount: number;
  /** Number of files still pending. */
  pendingCount: number;
  /** Number of files that failed or were rejected. */
  failedCount: number;
  /** Total batch progress 0–100. */
  totalProgress: number;
  onStart: () => void;
  onCancel: () => void;
  onClearAll: () => void;
}

/**
 * "Current activity" card. Sits at the top of the upload workflow
 * and answers the most important question at a glance:
 *   "What is happening right now?"
 */
export function UploadCurrentActivity({
  currentItem,
  currentIndex,
  batchSize,
  isActive,
  doneCount,
  pendingCount,
  failedCount,
  totalProgress,
  onStart,
  onCancel,
  onClearAll,
}: UploadCurrentActivityProps): JSX.Element {
  const hasItems = batchSize > 0 || currentItem !== null;
  const meta = currentItem ? getStatusMeta(currentItem.status) : null;

  // Headline (Arabic) shown above the title.
  const headline = !hasItems
    ? "ابدأ بإضافة ملفاتك"
    : isActive
      ? "جارٍ المعالجة"
      : currentItem?.status === "Success" && pendingCount === 0
        ? "اكتملت الدفعة"
        : "في انتظار البدء";

  // Subtitle: friendly description of the current state.
  const subtitle = !hasItems
    ? "اسحب الملفات أو اضغط للاختيار، ثم اضغط «ابدأ الرفع» لمتابعة الأرشفة."
    : isActive
      ? "تابع تقدّم كل ملف على حدة، والنتائج تظهر تدريجياً في الطابور."
      : pendingCount > 0 && failedCount === 0
        ? "كل الملفات جاهزة للرفع. اضغط «ابدأ الرفع» لمتابعة الأرشفة."
        : "راجع الطابور، ثم أعد المحاولة أو ابدأ الرفع.";

  return (
    <section className="asa-card relative overflow-hidden">
      {/* Top rail */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-palm via-tan to-tan-400"
      />

      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-7">
        {/* Left: state icon */}
        <div className="flex items-center gap-4">
          <div
            className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${
              isActive
                ? "border-palm-200 bg-palm-50 text-palm"
                : currentItem?.status === "Success" && pendingCount === 0
                  ? "border-palm-200 bg-palm-50 text-palm-700"
                  : "border-border bg-cream-soft text-oud"
            }`}
            aria-hidden="true"
          >
            {isActive ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : currentItem?.status === "Success" && pendingCount === 0 ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : currentItem?.status === "Failed" || currentItem?.status === "Rejected" ? (
              <AlertCircle className="h-6 w-6 text-maroon-500" />
            ) : (
              <Sparkles className="h-6 w-6" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="asa-kicker">{headline}</div>
            <div className="mt-1.5 font-display text-[18px] font-bold leading-snug text-ink-strong sm:text-[20px]">
              {!hasItems
                ? "لا توجد ملفات في الطابور"
                : currentItem
                  ? currentItem.name
                  : "في انتظار بدء المعالجة"}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              {meta && currentItem
                ? currentItem.message ?? meta.description
                : subtitle}
            </p>
          </div>
        </div>

        {/* Right: counts + controls */}
        <div className="flex flex-1 flex-col gap-3 lg:max-w-md">
          {hasItems && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-muted">
                <span className="font-display text-[12.5px] font-semibold text-ink-strong">
                  تقدّم الدفعة
                </span>
                <span className="font-mono text-[12px] text-ink-muted tnum" dir="ltr">
                  {totalProgress}%
                </span>
              </div>
              <UploadProgressBar
                value={isActive || totalProgress > 0 ? totalProgress : 0}
                tone="palm"
                size="md"
              />

              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Tag tone="palm" size="sm" leadingIcon={<CheckCircle2 className="h-3 w-3" aria-hidden="true" />}>
                  تم: <span className="tnum">{doneCount}</span>
                </Tag>
                <Tag tone="tan" size="sm" leadingIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}>
                  قيد التنفيذ: <span className="tnum">{pendingCount}</span>
                </Tag>
                {failedCount > 0 && (
                  <Tag tone="maroon" size="sm" leadingIcon={<AlertCircle className="h-3 w-3" aria-hidden="true" />}>
                    فشل/مرفوض: <span className="tnum">{failedCount}</span>
                  </Tag>
                )}
              </div>

              {currentItem && (
                <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-muted">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-palm-200 bg-palm-50 font-mono text-[11px] font-bold text-palm-700 tnum">
                    {currentIndex ?? 1}
                  </span>
                  <span>
                    من أصل{" "}
                    <span className="tnum font-semibold text-ink-strong">
                      {batchSize}
                    </span>{" "}
                    ملف
                  </span>
                </div>
              )}
            </>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!isActive && pendingCount > 0 && (
              <Button
                variant="primary"
                size="md"
                onClick={onStart}
                leadingIcon={<Play className="h-4 w-4" aria-hidden="true" />}
              >
                ابدأ الرفع
              </Button>
            )}
            {isActive && (
              <Button
                variant="secondary"
                size="md"
                onClick={onCancel}
                leadingIcon={<Pause className="h-4 w-4" aria-hidden="true" />}
              >
                إيقاف
              </Button>
            )}
            {hasItems && !isActive && (
              <Button
                variant="ghost"
                size="md"
                onClick={onClearAll}
                leadingIcon={<X className="h-4 w-4" aria-hidden="true" />}
              >
                تفريغ الطابور
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
