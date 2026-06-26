import { useState } from "react";
import { ChevronDown, ChevronUp, ListChecks, Sparkles, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import type { UploadItem, UploadItemStatus } from "../../state/useUploadQueue";
import { UploadQueueItem } from "./UploadQueueItem";

type Filter = "all" | "active" | "completed" | "failed";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "active", label: "قيد التنفيذ" },
  { id: "completed", label: "مكتمل" },
  { id: "failed", label: "فشل/مرفوض" },
];

function matchesFilter(status: UploadItemStatus, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "active")
    return status === "Queued" || status === "Uploading" || status === "Processing";
  if (filter === "completed") return status === "Success";
  if (filter === "failed")
    return status === "Failed" || status === "Rejected" || status === "Canceled";
  return true;
}

interface UploadQueuePanelProps {
  items: UploadItem[];
  currentId: string | null;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClearCompleted: () => void;
  /** Optional initial collapsed state. */
  initiallyCollapsed?: boolean;
}

export function UploadQueuePanel({
  items,
  currentId,
  onRetry,
  onRemove,
  onClearCompleted,
  initiallyCollapsed = false,
}: UploadQueuePanelProps): JSX.Element {
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<boolean>(initiallyCollapsed);

  const visible = items.filter((it) => matchesFilter(it.status, filter));

  const completed = items.filter((it) => it.status === "Success").length;
  const failed = items.filter(
    (it) => it.status === "Failed" || it.status === "Rejected" || it.status === "Canceled"
  ).length;
  const active = items.filter(
    (it) => it.status === "Uploading" || it.status === "Processing" || it.status === "Queued"
  ).length;

  // The "active" file is always pinned at the top, regardless of the
  // filter. We render it outside the filter loop, then the rest of the
  // visible list below.
  const currentItem = items.find((it) => it.id === currentId) ?? null;
  const isCurrentVisible = currentItem
    ? matchesFilter(currentItem.status, filter)
    : false;

  return (
    <section className="asa-card overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-cream-soft/60 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-palm text-white">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <div className="font-display text-[15px] font-bold text-ink-strong">
              طابور الرفع
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-palm" aria-hidden="true" />
                <span className="tnum">{completed}</span> مكتمل
              </span>
              <span className="text-ink-soft" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 text-oud" aria-hidden="true" />
                <span className="tnum">{active}</span> قيد التنفيذ
              </span>
              {failed > 0 && (
                <>
                  <span className="text-ink-soft" aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-maroon-600">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    <span className="tnum">{failed}</span> فشل/مرفوض
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {completed > 0 && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="font-display text-[12.5px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:text-maroon-500"
            >
              مسح المكتمل
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-paper px-2.5 text-[12px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                توسيع
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                طي
              </>
            )}
          </button>
        </div>
      </header>

      {/* Filter chips */}
      {!collapsed && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-paper px-5 py-3">
          {FILTERS.map((f) => {
            const count = items.filter((it) => matchesFilter(it.status, f.id)).length;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-colors duration-180 ease-out-expo ${
                  active
                    ? "border-palm-200 bg-palm-50 text-palm-700"
                    : "border-border bg-paper text-ink-muted hover:bg-cream-soft hover:text-ink"
                }`}
              >
                <span>{f.label}</span>
                <span
                  dir="ltr"
                  className={`rounded-sm px-1.5 py-0.5 font-mono text-[10.5px] tnum ${
                    active
                      ? "bg-paper text-palm-700"
                      : "bg-cream-soft text-ink-soft"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!collapsed && (
        <ol
          className="max-h-[420px] overflow-y-auto scrollbar-thin"
          aria-label="قائمة الملفات المرفوعة"
        >
          {/* Pinned current item */}
          {currentItem && isCurrentVisible && (
            <UploadQueueItem
              item={currentItem}
              index={items.findIndex((it) => it.id === currentItem.id) + 1}
              isCurrent
              onRetry={onRetry}
              onRemove={onRemove}
            />
          )}

          {/* Remaining items (skip the current one if it was already pinned) */}
          {visible
            .filter((it) => it.id !== currentId || !isCurrentVisible)
            .map((it) => (
              <UploadQueueItem
                key={it.id}
                item={it}
                index={items.findIndex((x) => x.id === it.id) + 1}
                isCurrent={it.id === currentId}
                onRetry={onRetry}
                onRemove={onRemove}
              />
            ))}

          {visible.length === 0 && items.length > 0 && (
            <li className="px-5 py-8 text-center text-[13px] text-ink-muted">
              لا توجد ملفات في هذا التصفية.
            </li>
          )}

          {items.length === 0 && (
            <li className="px-5 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-cream-soft">
                <Sparkles className="h-5 w-5 text-oud" aria-hidden="true" />
              </div>
              <div className="font-display text-[14px] font-bold text-ink-strong">
                الطابور فارغ
              </div>
              <div className="mt-1 text-[12.5px] text-ink-muted">
                اسحب الملفات إلى منطقة الرفع أعلاه لبدء الأرشفة.
              </div>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
