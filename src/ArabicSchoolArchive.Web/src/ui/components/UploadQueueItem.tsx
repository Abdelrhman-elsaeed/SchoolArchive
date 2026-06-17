import {
  FileText,
  FileType,
  FileImage,
  FileSpreadsheet,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import type { UploadItem } from "../../api/hooks/useUploadQueue";
import { getStatusMeta } from "../upload/statusMeta";
import { Tag } from "./Tag";
import { UploadProgressBar } from "./UploadProgressBar";

interface UploadQueueItemProps {
  item: UploadItem;
  /** 1-based index in the whole queue (for the small "n" marker on the left). */
  index: number;
  /** Highlight the row when it's the currently active file. */
  isCurrent: boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

function fileIcon(name: string): typeof FileText {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return FileText;
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return FileType;
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return FileSpreadsheet;
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    return FileImage;
  return FileText;
}

function fileTone(name: string): { tile: string; text: string; border: string } {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf"))
    return { tile: "bg-maroon-50", text: "text-maroon-500", border: "border-maroon-200" };
  if (lower.endsWith(".doc") || lower.endsWith(".docx"))
    return { tile: "bg-navy-50", text: "text-navy-500", border: "border-navy-100" };
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx"))
    return { tile: "bg-palm-50", text: "text-palm-600", border: "border-palm-200" };
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    return { tile: "bg-oud-50", text: "text-oud", border: "border-oud-100" };
  return { tile: "bg-cream-soft", text: "text-oud", border: "border-border" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

/** Status icon for the trailing slot on a terminal row. */
function StatusIcon({ status }: { status: UploadItem["status"] }): JSX.Element {
  if (status === "Success") return <CheckCircle2 className="h-4 w-4 text-palm" aria-hidden="true" />;
  if (status === "Rejected")
    return <AlertCircle className="h-4 w-4 text-tan-600" aria-hidden="true" />;
  if (status === "Failed")
    return <AlertCircle className="h-4 w-4 text-maroon-500" aria-hidden="true" />;
  if (status === "Canceled")
    return <X className="h-4 w-4 text-ink-soft" aria-hidden="true" />;
  if (status === "Uploading" || status === "Processing")
    return <RefreshCw className="h-4 w-4 text-palm animate-spin" aria-hidden="true" />;
  return <Clock className="h-4 w-4 text-ink-soft" aria-hidden="true" />;
}

export function UploadQueueItem({
  item,
  index,
  isCurrent,
  onRetry,
  onRemove,
}: UploadQueueItemProps): JSX.Element {
  const meta = getStatusMeta(item.status);
  const Icon = fileIcon(item.name);
  const tone = fileTone(item.name);
  const showProgress = meta.isActive || item.status === "Success";

  // Trailing label on the progress bar: size for terminal success,
  // percent for active indeterminate, nothing else.
  const trailing =
    item.status === "Success"
      ? formatBytes(item.size)
      : meta.isActive
        ? "—"
        : undefined;

  const progressValue = item.status === "Success" ? 100 : item.progress;

  return (
    <li
      className={`group relative flex items-center gap-3 border-b border-border-soft px-4 py-3 last:border-b-0 transition-colors duration-180 ease-out-expo ${
        isCurrent
          ? "bg-palm-50/60"
          : item.status === "Failed" || item.status === "Rejected"
            ? "bg-maroon-50/30 hover:bg-maroon-50/50"
            : "hover:bg-cream-soft/60"
      }`}
    >
      {/* Current marker — a thin palm rail on the start side. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-3 start-0 w-[3px] rounded-full transition-opacity duration-180 ${
          isCurrent ? "bg-palm opacity-100" : "opacity-0"
        }`}
      />

      {/* Index */}
      <span
        dir="ltr"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11.5px] font-bold tnum ${
          isCurrent
            ? "border-palm-200 bg-palm text-white"
            : "border-border bg-cream-soft text-ink-muted"
        }`}
      >
        {index}
      </span>

      {/* File kind tile */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${tone.tile} ${tone.text} ${tone.border}`}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`min-w-0 truncate text-[13.5px] font-semibold ${
              item.status === "Failed" || item.status === "Rejected"
                ? "text-ink-strong"
                : "text-ink-strong"
            }`}
            title={item.name}
          >
            {item.name}
          </span>
          <Tag tone={meta.tone} size="sm">
            {meta.label}
          </Tag>
          {isCurrent && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-palm-700">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              يُعالَج الآن
            </span>
          )}
        </div>

        {/* Status / message line */}
        <div
          className={`mt-1 truncate text-[12px] ${
            item.status === "Failed"
              ? "text-maroon-600"
              : item.status === "Rejected"
                ? "text-tan-700"
                : "text-ink-muted"
          }`}
          title={item.message ?? ""}
        >
          {item.message ?? meta.description}
        </div>

        {/* Progress */}
        {showProgress && (
          <div className="mt-2">
            <UploadProgressBar
              value={progressValue}
              tone={
                item.status === "Success"
                  ? "palm"
                  : item.status === "Failed" || item.status === "Rejected"
                    ? "maroon"
                    : "palm"
              }
              size="sm"
              trailingLabel={trailing}
            />
          </div>
        )}

        {/* Reason code, if the server gave us one */}
        {item.result?.reasonCode && (
          <div className="mt-1 text-[11px] text-ink-soft" dir="ltr">
            <span className="font-mono">الرمز: {item.result.reasonCode}</span>
          </div>
        )}
      </div>

      {/* Trailing action slot */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Right-hand status icon for terminal rows */}
        {meta.isTerminal && <StatusIcon status={item.status} />}

        {/* Retry */}
        {(item.status === "Failed" ||
          item.status === "Rejected" ||
          item.status === "Canceled") && (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-paper px-2.5 text-[12px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink hover:border-border-strong"
            title="إعادة المحاولة"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            إعادة
          </button>
        )}

        {/* Remove (always available, even for active items) */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-maroon-500"
          aria-label={`إزالة ${item.name}`}
          title="إزالة"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
