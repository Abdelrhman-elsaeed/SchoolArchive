import type { UploadItemStatus } from "../../api/hooks/useUploadQueue";
import type { TagTone } from "../components/Tag";

export interface StatusMeta {
  /** Short Arabic label used in chips, status row, and summary. */
  label: string;
  /** Long Arabic description used in tooltips / current activity. */
  description: string;
  /** Tag tone for the chip. */
  tone: TagTone;
  /** A short verb for the activity card (e.g. "يُرفع الآن"). */
  activity: string;
  /** Whether the row is considered "active" (highlight + progress). */
  isActive: boolean;
  /** Whether the row is considered terminal (Success / Rejected / Failed / Canceled). */
  isTerminal: boolean;
  /** True for indeterminate progress (we don't fake byte counts). */
  isIndeterminate: boolean;
}

const META: Record<UploadItemStatus, StatusMeta> = {
  Queued: {
    label: "في الانتظار",
    description: "الملف جاهز لرفعه وينتظر دوره في الطابور.",
    tone: "outline",
    activity: "في قائمة الانتظار",
    isActive: false,
    isTerminal: false,
    isIndeterminate: false,
  },
  Uploading: {
    label: "جارٍ الرفع",
    description: "يتم إرسال الملف إلى الخادم الآن.",
    tone: "palm",
    activity: "جارٍ رفع الملف الحالي…",
    isActive: true,
    isTerminal: false,
    isIndeterminate: true,
  },
  Processing: {
    label: "قيد المعالجة",
    description: "تم استلام الملف من الخادم ويجري فحصه وتصنيفه وأرشفته.",
    tone: "tan",
    activity: "جارٍ فحص الملف وتصنيفه…",
    isActive: true,
    isTerminal: false,
    isIndeterminate: true,
  },
  Success: {
    label: "مكتمل",
    description: "تمت أرشفة الملف بنجاح.",
    tone: "palm",
    activity: "اكتمل الرفع",
    isActive: false,
    isTerminal: true,
    isIndeterminate: false,
  },
  Rejected: {
    label: "مرفوض",
    description: "رفض الخادم الملف بسبب مخالفة لقاعدة من قواعد الأرشفة.",
    tone: "tan",
    activity: "تم رفض الملف",
    isActive: false,
    isTerminal: true,
    isIndeterminate: false,
  },
  Failed: {
    label: "فشل",
    description: "تعذّر إكمال الرفع بسبب خطأ في الشبكة أو الخادم.",
    tone: "maroon",
    activity: "فشل رفع الملف",
    isActive: false,
    isTerminal: true,
    isIndeterminate: false,
  },
  Canceled: {
    label: "تم الإلغاء",
    description: "أُلغي رفع هذا الملف بناءً على طلبك.",
    tone: "neutral",
    activity: "تم الإلغاء",
    isActive: false,
    isTerminal: true,
    isIndeterminate: false,
  },
};

export function getStatusMeta(status: UploadItemStatus): StatusMeta {
  return META[status];
}
