import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  FileStack,
  ArrowUp,
} from "lucide-react";
import { UploadProgressBar } from "./UploadProgressBar";
import type { UploadItemStatus } from "../../state/useUploadQueue";

interface UploadBatchSummaryProps {
  total: number;
  done: number;
  pending: number;
  failed: number;
  totalBytes: number;
  uploadedBytes: number;
  totalProgress: number;
  isActive: boolean;
}

/**
 * Compact, always-visible summary of the upload batch.
 * Used at the top of the queue panel as a sub-header. Replaces the
 * previous "PageStat" row with a richer, live view.
 */
export function UploadBatchSummary({
  total,
  done,
  pending,
  failed,
  totalBytes,
  uploadedBytes,
  totalProgress,
  isActive,
}: UploadBatchSummaryProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        tone="palm"
        icon={<FileStack className="h-4 w-4 text-palm-600" aria-hidden="true" />}
        label="إجمالي الملفات"
        value={total.toLocaleString("ar-SA")}
        footer={
          <UploadProgressBar
            value={isActive || totalProgress > 0 ? totalProgress : 0}
            tone="palm"
            size="sm"
          />
        }
      />
      <SummaryCard
        tone="palm"
        icon={<CheckCircle2 className="h-4 w-4 text-palm-600" aria-hidden="true" />}
        label="مكتمل"
        value={done.toLocaleString("ar-SA")}
        footer={
          <span className="font-display text-[12.5px] text-ink-muted">
            من إجمالي <span className="tnum font-semibold text-ink-strong">{total}</span> ملف
          </span>
        }
      />
      <SummaryCard
        tone="tan"
        icon={<Clock className="h-4 w-4 text-tan-600" aria-hidden="true" />}
        label="قيد التنفيذ"
        value={pending.toLocaleString("ar-SA")}
        footer={
          <span className="font-display text-[12.5px] text-ink-muted">
            في انتظار الرفع أو قيد المعالجة
          </span>
        }
      />
      <SummaryCard
        tone="ink"
        icon={<ArrowUp className="h-4 w-4 text-navy-500" aria-hidden="true" />}
        label="البيانات"
        value={`${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)}`}
        footer={
          <span className="font-display text-[12.5px] text-ink-muted">
            {failed > 0 ? (
              <span className="text-maroon-600">
                <AlertCircle className="ms-1 inline h-3 w-3 align-text-bottom" aria-hidden="true" />
                <span className="tnum">{failed}</span> ملف يحتاج اهتمامك
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-palm-700">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                لا توجد أخطاء
              </span>
            )}
          </span>
        }
      />
    </div>
  );
}

interface SummaryCardProps {
  tone: "palm" | "tan" | "ink" | "maroon";
  icon: React.ReactNode;
  label: string;
  value: string;
  footer?: React.ReactNode;
}

function SummaryCard({ icon, label, value, footer }: SummaryCardProps): JSX.Element {
  return (
    <div className="asa-card-soft flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-paper border border-border">
          {icon}
        </span>
        <span className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {label}
        </span>
      </div>
      <div className="font-display text-[20px] font-bold tnum text-ink-strong">
        {value}
      </div>
      <div className="text-[12px] text-ink-muted">{footer}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

/* Re-export a helper for callers that just want the chip. */
export function countLabel(count: number, status: UploadItemStatus): string {
  switch (status) {
    case "Success":
      return `مكتمل: ${count}`;
    case "Failed":
      return `فشل: ${count}`;
    case "Rejected":
      return `مرفوض: ${count}`;
    case "Canceled":
      return `ملغى: ${count}`;
    case "Uploading":
    case "Processing":
      return `قيد التنفيذ: ${count}`;
    case "Queued":
    default:
      return `في الانتظار: ${count}`;
  }
}
