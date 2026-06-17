import type { UploadStatus } from "../../api/contracts";
import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

interface StatusBadgeProps {
  status: UploadStatus;
}

const LABELS: Record<UploadStatus, string> = {
  Success: "ناجح",
  Rejected: "مرفوض",
  Failed: "فشل",
  Pending: "قيد المعالجة",
};

const STYLES: Record<
  UploadStatus,
  { container: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  Success: {
    container: "bg-palm-50 text-palm-700 border-palm-200",
    icon: "text-palm-600",
    Icon: CheckCircle2,
  },
  Rejected: {
    container: "bg-tan-50 text-tan-700 border-tan-200",
    icon: "text-tan-600",
    Icon: XCircle,
  },
  Failed: {
    container: "bg-maroon-50 text-maroon-600 border-maroon-200",
    icon: "text-maroon-500",
    Icon: AlertCircle,
  },
  Pending: {
    container: "bg-cream-soft text-oud border-border",
    icon: "text-oud",
    Icon: Clock,
  },
};

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const { container, icon, Icon } = STYLES[status];
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold ${container}`}
    >
      <Icon className={`h-3.5 w-3.5 ${icon}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
