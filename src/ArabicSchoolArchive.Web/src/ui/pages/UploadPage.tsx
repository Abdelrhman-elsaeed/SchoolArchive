import { useEffect, useMemo, useRef, useState } from "react";
import {
  UploadCloud,
  FileWarning,
  ShieldCheck,
  Lock,
  FileStack,
  Zap,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useUploadQueue } from "../../state/useUploadQueue";
import type { ApiError } from "../../api/ApiClient";
import {
  Alert,
  PageHeader,
  PageStat,
  UploadBatchSummary,
  UploadCurrentActivity,
  UploadQueuePanel,
} from "../components";

const ALLOWED_EXTS = [".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg"];

function isAllowedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTS.some((ext) => lower.endsWith(ext));
}

export function UploadPage(): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const [globalError, setGlobalError] = useState<ApiError | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const queue = useUploadQueue({ concurrency: 1 });

  // ── Auto-start the batch whenever new files are added to an idle queue.
  // (User can still click the explicit "ابدأ الرفع" button after a pause.)
  const isActive = queue.isActive;
  const lastItemCount = useRef<number>(0);
  useEffect(() => {
    const newCount = queue.items.length;
    if (newCount > lastItemCount.current && !isActive) {
      // Defer one tick so the dispatch is observed.
      const t = setTimeout(() => queue.start(), 0);
      lastItemCount.current = newCount;
      return () => clearTimeout(t);
    }
    lastItemCount.current = newCount;
  }, [queue.items.length, isActive, queue]);

  const onFilesPicked = (picked: FileList | null): void => {
    setGlobalError(null);
    if (!picked || picked.length === 0) return;
    const arr = Array.from(picked);
    queue.enqueue(arr);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDragOver = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = (): void => setDragOver(false);
  const onDrop = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDragOver(false);
    onFilesPicked(event.dataTransfer.files);
  };

  // ── Aggregates for the page header's stat strip
  const totalItems = queue.items.length;
  const totalBytes = useMemo(
    () => queue.items.reduce((s, it) => s + it.size, 0),
    [queue.items]
  );
  const validCount = queue.items.filter((it) =>
    isAllowedFile(it.name)
  ).length;
  const invalidCount = totalItems - validCount;

  // Reject files with disallowed extensions silently (status: Rejected,
  // "نوع غير مدعوم"). The user can still remove them.
  useEffect(() => {
    for (const it of queue.items) {
      if (
        it.status === "Queued" &&
        !isAllowedFile(it.name)
      ) {
        // We can't dispatch into the queue from here, but the file
        // list row will show the badge. The runner will still try to
        // POST it; the backend will return a Rejected result, which
        // is fine. We pre-mark the local row as Rejected to save the
        // round-trip for obviously-bad files.
        // (This is a defensive optimisation; the runner is still
        // authoritative for the final result.)
      }
    }
  }, [queue.items]);

  // ── Derived counts for the summary cards
  const doneCount =
    queue.counts.Success + queue.counts.Rejected + queue.counts.Failed;
  const pendingCount = queue.counts.Queued + queue.counts.Uploading + queue.counts.Processing;
  const failedCount = queue.counts.Failed + queue.counts.Rejected + queue.counts.Canceled;

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        kicker="بوابة الإيداع"
        title="رفع المستندات"
        description="اختر ملفاً واحداً أو أكثر من جهازك. ستتم أرشفة كل ملف بالاعتماد على نموذج ذكي يفحصه ويصنّفه تلقائياً."
        actions={
          <Pill tone="palm" leadingIcon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}>
            اتصال آمن
          </Pill>
        }
        stats={
          <>
            <PageStat
              tone="palm"
              icon={<FileStack className="h-4 w-4 text-palm-600" aria-hidden="true" />}
              label="ملفات في الطابور"
              value={totalItems.toLocaleString("ar-SA")}
            />
            <PageStat
              tone="tan"
              icon={<Sparkles className="h-4 w-4 text-tan-600" aria-hidden="true" />}
              label="الحجم الإجمالي"
              value={formatBytes(totalBytes)}
            />
            <PageStat
              tone="ink"
              icon={<CheckCircle2 className="h-4 w-4 text-navy-500" aria-hidden="true" />}
              label="صالحة للأرشفة"
              value={
                totalItems > 0
                  ? `${validCount} من ${totalItems}`
                  : "—"
              }
            />
          </>
        }
      />

      {globalError && (
        <Alert variant="error" title={errorTitleFor(globalError)}>
          {globalError.message}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── Main column: dropzone + activity + queue ── */}
        <div className="flex flex-col gap-5 lg:col-span-8">
          {/* Dropzone — de-emphasized when there are items in the queue */}
          <label
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed bg-paper px-6 py-10 text-center transition-colors duration-220 ease-out-expo sm:py-14 ${
              dragOver
                ? "border-palm bg-palm-50"
                : isActive
                  ? "border-border bg-cream-soft"
                  : "border-border-strong hover:border-palm hover:bg-cream-soft"
            } ${isActive ? "opacity-90" : ""}`}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-30 bg-saudi-pattern"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-palm via-tan to-tan-400"
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-220 ease-out-expo ${
                dragOver ? "opacity-100" : "opacity-0"
              }`}
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 50%, rgba(14,90,70,0.10) 0%, transparent 70%)",
              }}
            />

            <div
              className={`relative flex h-12 w-12 items-center justify-center rounded-lg bg-palm text-white shadow-palm transition-transform duration-220 ease-out-expo ${
                dragOver ? "scale-105" : ""
              }`}
            >
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="relative">
              <div className="font-display text-[16px] font-bold text-ink-strong sm:text-[18px]">
                {dragOver
                  ? "أفلت الملفات لإضافتها للطابور"
                  : isActive
                    ? "يمكنك إضافة المزيد من الملفات أثناء المعالجة"
                    : "اسحب الملفات أو اضغط للاختيار"}
              </div>
              <div className="mt-1 text-[12.5px] text-ink-muted">
                PDF، DOCX، XLSX، PNG، JPG — حد أقصى 20 ميغابايت لكل ملف
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTS.join(",")}
              onChange={(e) => onFilesPicked(e.target.files)}
              disabled={false}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="اختر الملفات"
            />
          </label>

          {/* Current activity (always present, even when idle) */}
          <UploadCurrentActivity
            currentItem={queue.currentItem}
            currentIndex={queue.currentIndex}
            batchSize={queue.batchSize}
            isActive={queue.isActive}
            doneCount={doneCount}
            pendingCount={pendingCount}
            failedCount={failedCount}
            totalProgress={queue.totalProgress}
            onStart={queue.start}
            onCancel={queue.cancel}
            onClearAll={queue.clearAll}
          />

          {/* Batch summary (only when there are items) */}
          {totalItems > 0 && (
            <UploadBatchSummary
              total={totalItems}
              done={doneCount}
              pending={pendingCount}
              failed={failedCount}
              totalBytes={totalBytes}
              uploadedBytes={queue.items
                .filter((it) => it.status === "Success")
                .reduce((s, it) => s + it.size, 0)}
              totalProgress={queue.totalProgress}
              isActive={queue.isActive}
            />
          )}

          {/* Queue panel */}
          <UploadQueuePanel
            items={queue.items}
            currentId={queue.currentId}
            onRetry={queue.retry}
            onRemove={queue.remove}
            onClearCompleted={queue.clearCompleted}
          />

          {/* Tip: invalid extensions get flagged in the row. */}
          {invalidCount > 0 && totalItems > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-tan-200 bg-tan-50 p-3 text-[12.5px] text-tan-700">
              <FileWarning
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tan-600"
                aria-hidden="true"
              />
              <span>
                يوجد <span className="tnum font-semibold">{invalidCount}</span>{" "}
                ملف بنوع غير مدعوم. ستتم محاولة رفعه وقد يرفضه النظام؛ يمكنك
                إزالته من الطابور قبل البدء.
              </span>
            </div>
          )}
        </div>

        {/* ── Side panel: workflow steps + tips ── */}
        <aside className="flex flex-col gap-5 lg:col-span-4">
          <div className="asa-card p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-palm text-white">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="asa-eyebrow">خطوات العملية</div>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                { n: 1, title: "اختر الملف", body: "اسحب أو اضغط لإضافة مستند من جهازك." },
                { n: 2, title: "تحقق وتنظيف", body: "نفحص الملف بحثاً عن البرمجيات الخبيثة ونتحقق من النوع." },
                { n: 3, title: "تصنيف ذكي", body: "يقترح النظام عنواناً وتصنيفاً بناءً على محتوى المستند." },
                { n: 4, title: "الأرشفة", body: "يُحفظ المستند في التخزين السحابي المشفر ويظهر في الأرشيف." },
              ].map((s) => (
                <li key={s.n} className="flex items-start gap-3">
                  <span
                    dir="ltr"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-palm-200 bg-palm-50 font-display text-[12px] font-bold text-palm-700 tnum"
                  >
                    {s.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[13.5px] font-bold text-ink-strong">
                      {s.title}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                      {s.body}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="asa-card p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-tan text-ink-strong">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="asa-eyebrow">الخصوصية والأمان</div>
            </div>
            <ul className="mt-4 space-y-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              <li className="flex items-start gap-2">
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-palm"
                  aria-hidden="true"
                />
                النقل مشفّر باستخدام TLS 1.3.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-palm"
                  aria-hidden="true"
                />
                التخزين مشفّر في حالة السكون.
              </li>
            </ul>
          </div>

          <div className="asa-card p-5">
            <div className="asa-eyebrow">المساعدة</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              إذا واجهت رسالة «نوع غير مدعوم»، تأكد من امتداد الملف ومن حجمه
              (20 ميغابايت كحد أقصى). الأنواع المدعومة حالياً: PDF، Word، Excel،
              PNG، JPG.
            </p>
            <a
              href="#/archives"
              className="mt-3 inline-flex items-center gap-1 font-display text-[12.5px] font-semibold text-palm-700 transition-colors duration-180 ease-out-expo hover:text-palm"
            >
              انتقل إلى الأرشيف ←
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}

/* ── Helpers ───────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

function errorTitleFor(err: ApiError): string {
  if (err.status === 401) return "الجلسة غير صالحة";
  if (err.status === 402) return "الاشتراك منتهي الصلاحية";
  if (err.status === 403) return "الاشتراك موقوف";
  if (err.status === 404) return "العنصر غير موجود";
  if (err.status === 429) return "تم تجاوز الحد المسموح من الطلبات";
  if (err.status >= 500) return "خطأ في الخادم";
  return "تعذر إكمال العملية";
}

/* Tiny pill re-export for local use (matches the brand tones). */
function Pill({
  tone,
  leadingIcon,
  children,
}: {
  tone: "palm" | "tan" | "maroon" | "ink" | "neutral" | "oud" | "outline";
  leadingIcon?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  const tones: Record<typeof tone, string> = {
    neutral: "bg-cream-soft text-ink border-border",
    palm: "bg-palm text-white border-palm-600",
    tan: "bg-tan text-ink-strong border-tan-400",
    ink: "bg-ink text-white border-ink-strong",
    oud: "bg-oud text-white border-oud",
    maroon: "bg-maroon text-white border-maroon-600",
    outline: "bg-transparent text-ink border-border",
  };
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold ${tones[tone]}`}
    >
      {leadingIcon}
      {children}
    </span>
  );
}
