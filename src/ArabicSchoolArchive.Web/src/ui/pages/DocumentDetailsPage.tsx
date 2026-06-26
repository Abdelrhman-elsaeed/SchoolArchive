import { useState } from "react";
import {
  Download,
  ArrowRight,
  FileText,
  Calendar,
  Tag,
  HardDrive,
  Hash,
  FolderOpen,
  Info,
  AlertTriangle,
  Quote,
  ShieldCheck,
  Sparkles,
  Share2,
  Printer,
  Eye,
} from "lucide-react";
import { useArchiveById, useArchiveDownloadUrl } from "../../state/useArchives";
import { useApi } from "../../api/ApiClientContext";
import { useLocalDev } from "../../api/LocalDevContext";
import type { ApiError } from "../../api/ApiClient";
import {
  Alert,
  Button,
  Loading,
  PageHeader,
  Tag as Pill,
} from "../components";
import { formatBytes, formatDate } from "../components/DocumentCard";

interface DocumentDetailsPageProps {
  documentId: string;
}

export function DocumentDetailsPage({
  documentId,
}: DocumentDetailsPageProps): JSX.Element {
  const api = useApi();
  const { info: localDev } = useLocalDev();
  const { data: item, isLoading, isError, error } = useArchiveById(documentId);
  const fetchDownload = useArchiveDownloadUrl(documentId);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<ApiError | null>(null);

  const onDownload = async (): Promise<void> => {
    setDownloading(true);
    setDownloadError(null);
    try {
      if (localDev.downloadStreamEnabled) {
        const blob = await api.getBlob(`/api/v1/archive/archives/${documentId}/content`);
        const url = URL.createObjectURL(blob);
        const filename = item?.originalName ?? `archive-${documentId}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      const result = await fetchDownload.refetch();
      if (result.data) {
        window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setDownloadError(err as ApiError);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex flex-col gap-7">
        <Loading label="جاري تحميل تفاصيل المستند..." />
      </section>
    );
  }

  if (isError) {
    const apiError = error as unknown as ApiError;
    return (
      <section className="flex flex-col gap-5">
        <Alert variant="error" title={errorTitleFor(apiError)}>
          {apiError.message}
        </Alert>
        <BackToArchiveButton />
      </section>
    );
  }

  if (!item) {
    return (
      <section className="flex flex-col gap-5">
        <Alert variant="error" title="العنصر غير موجود">
          تعذر العثور على المستند المطلوب.
        </Alert>
        <BackToArchiveButton />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-7">
      <a
        href="#/archives"
        className="group inline-flex w-fit items-center gap-1.5 font-display text-[13.5px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:text-palm-700"
      >
        <ArrowRight
          className="h-4 w-4 transition-transform duration-180 ease-out-expo group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
        العودة إلى الأرشيف
      </a>

      {downloadError && (
        <Alert variant="error" title={errorTitleFor(downloadError)}>
          {downloadError.message}
        </Alert>
      )}

      <PageHeader
        kicker="تفاصيل المستند"
        title={item.displayName ?? item.originalName}
        description={
          <>
            {item.category && (
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                {item.category}
              </span>
            )}
            {item.category && (
              <span className="mx-2 text-ink-soft" aria-hidden="true">
                ·
              </span>
            )}
            <span className="text-ink-muted">تم الرفع في {formatDate(item.uploadedAtUtc)}</span>
            {item.displayName &&
              item.displayName !== item.originalName && (
                <>
                  <span className="mx-2 text-ink-soft" aria-hidden="true">
                    ·
                  </span>
                  <span
                    className="ltr-mono text-[12.5px] text-ink-soft"
                    dir="ltr"
                  >
                    {item.originalName}
                  </span>
                </>
              )}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Share2 className="h-4 w-4" aria-hidden="true" />}
            >
              مشاركة
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<Printer className="h-4 w-4" aria-hidden="true" />}
            >
              طباعة
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onDownload}
              disabled={downloading}
              leadingIcon={<Download className="h-4 w-4" aria-hidden="true" />}
            >
              {downloading ? "جاري تجهيز الرابط…" : "تنزيل المستند"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          {/* Hero card */}
          <div className="asa-card relative overflow-hidden p-6 sm:p-7">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-palm via-tan to-tan-400"
            />
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-palm-200 bg-palm-50 text-palm-600">
                <FileText className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone="palm" size="sm">
                    مستند مؤرشف
                  </Pill>
                  {item.displayName && (
                    <Pill
                      tone="tan"
                      size="sm"
                      leadingIcon={
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                      }
                    >
                      عنوان مقترح
                    </Pill>
                  )}
                  {item.needsReview && (
                    <Pill
                      tone="maroon"
                      size="sm"
                      leadingIcon={
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      }
                    >
                      يحتاج مراجعة
                    </Pill>
                  )}
                  {item.category && (
                    <Pill tone="ink" size="sm">
                      {item.category}
                    </Pill>
                  )}
                </div>
                <h2 className="mt-3 font-display text-[20px] font-bold leading-snug text-ink-strong sm:text-[22px]">
                  {item.displayName ?? item.originalName}
                </h2>
                {item.tags && item.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.tags.map((t) => (
                      <Pill key={t} tone="neutral" size="sm">
                        #{t}
                      </Pill>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {localDev.downloadStreamEnabled && (
              <div className="mt-5 flex items-start gap-2 rounded-md border border-navy-100 bg-navy-50 p-3 text-[12.5px] text-navy-700">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  يستخدم هذا التنزيل مسار التطوير المحلي (GET /content) بدلاً
                  من عنوان SAS حتى لا يحتاج المتصفح إلى حل اسم DNS الخاص بـ
                  Azurite داخل Docker.
                </span>
              </div>
            )}
          </div>

          {item.summary && (
            <div className="asa-card relative overflow-hidden p-6 sm:p-7">
              <div
                aria-hidden="true"
                className="absolute inset-y-4 end-0 w-[3px] rounded-full bg-gradient-to-b from-palm to-tan"
              />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-tan-200 bg-tan-50 text-tan-600">
                  <Quote className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="asa-eyebrow">ملخص المستند</div>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink">
                    {item.summary}
                  </p>
                </div>
              </div>
            </div>
          )}

          {item.needsReview && (
            <div
              className="flex items-start gap-3 rounded-lg border border-tan-200 bg-tan-50 p-4 text-tan-700"
              role="alert"
            >
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-tan-600"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[14px] font-bold text-ink-strong">
                  هذا المستند يحتاج إلى مراجعة يدوية
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed">
                  أشار نظام التصنيف إلى أن نسبة الدقة منخفضة، يرجى التحقق من
                  البيانات الوصفية قبل الاعتماد عليها.
                </p>
              </div>
            </div>
          )}

          {/* Details table */}
          <div className="asa-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-cream-soft/60 px-5 py-3">
              <div>
                <div className="asa-eyebrow">التفاصيل</div>
                <h3 className="mt-1 font-display text-[15px] font-bold text-ink-strong">
                  البيانات الوصفية المسجلة عند الأرشفة
                </h3>
              </div>
              <Pill tone="outline" size="sm" leadingIcon={<Eye className="h-3 w-3" aria-hidden="true" />}>
                عرض للقراءة فقط
              </Pill>
            </div>
            <dl className="divide-y divide-border-soft">
              <DetailRow
                icon={<Hash className="h-4 w-4" aria-hidden="true" />}
                label="رقم المستند"
                value={item.documentId}
                mono
              />
              <DetailRow
                icon={<FileText className="h-4 w-4" aria-hidden="true" />}
                label="الاسم الأصلي"
                value={item.originalName}
              />
              {item.displayName && (
                <DetailRow
                  icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                  label="عنوان مقترح"
                  value={item.displayName}
                />
              )}
              <DetailRow
                icon={<Tag className="h-4 w-4" aria-hidden="true" />}
                label="التصنيف"
                value={item.category ?? "—"}
              />
              {item.tags && item.tags.length > 0 && (
                <DetailRow
                  icon={<Tag className="h-4 w-4" aria-hidden="true" />}
                  label="الوسوم"
                  value={
                    <div className="flex flex-wrap gap-1.5">
                      {item.tags.map((t) => (
                        <Pill key={t} tone="neutral" size="sm">
                          #{t}
                        </Pill>
                      ))}
                    </div>
                  }
                />
              )}
              <DetailRow
                icon={<Info className="h-4 w-4" aria-hidden="true" />}
                label="نوع الملف"
                value={item.mimeType}
                mono
              />
              <DetailRow
                icon={<HardDrive className="h-4 w-4" aria-hidden="true" />}
                label="الحجم"
                value={formatBytes(item.sizeBytes)}
              />
              <DetailRow
                icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
                label="تاريخ الرفع"
                value={formatDate(item.uploadedAtUtc)}
              />
              <DetailRow
                icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
                label="السنة / الشهر المعالجة"
                value={`${item.processingYear} / ${String(item.processingMonth).padStart(2, "0")}`}
              />
              <DetailRow
                icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
                label="المسار في التخزين"
                value={item.blobObjectName}
                mono
              />
            </dl>
          </div>
        </div>

        {/* Side panel */}
        <aside className="flex flex-col gap-5 lg:col-span-4">
          {item.confidence !== null && item.confidence !== undefined && (
            <div className="asa-card p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-palm text-white">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="asa-eyebrow">دقة التصنيف</div>
                  <h3 className="mt-0.5 font-display text-[14px] font-bold text-ink-strong">
                    ثقة الذكاء الاصطناعي
                  </h3>
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span
                  className={`font-display text-[36px] font-bold tnum leading-none ${
                    item.confidence >= 0.8 ? "text-palm-600" : "text-tan-600"
                  }`}
                >
                  {Math.round(item.confidence * 100)}
                </span>
                <span className="font-display text-[14px] font-semibold text-ink-muted">
                  %
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cream-soft">
                <div
                  className={`h-full rounded-full transition-all duration-320 ease-out-expo ${
                    item.confidence >= 0.8 ? "bg-palm" : "bg-tan-500"
                  }`}
                  style={{
                    width: `${Math.max(0, Math.min(100, item.confidence * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[12px] text-ink-muted">
                {item.confidence >= 0.8
                  ? "التصنيف موثوق ويمكن الاعتماد عليه."
                  : "التصنيف متوسّط — نوصي بمراجعة يدوية."}
              </p>
            </div>
          )}

          <div className="asa-card p-5">
            <div className="asa-eyebrow">معلومات سريعة</div>
            <ul className="mt-4 divide-y divide-border-soft text-[13.5px]">
              <li className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">الحجم</span>
                <span className="font-semibold text-ink-strong tnum">
                  {formatBytes(item.sizeBytes)}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">السنة</span>
                <span className="font-semibold text-ink-strong tnum">
                  {item.processingYear}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">الشهر</span>
                <span className="font-semibold text-ink-strong tnum">
                  {String(item.processingMonth).padStart(2, "0")}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">التصنيف</span>
                <span className="font-semibold text-ink-strong">
                  {item.category ?? "—"}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">الوسوم</span>
                <span className="font-semibold text-ink-strong">
                  {item.tags && item.tags.length > 0 ? item.tags.length : "—"}
                </span>
              </li>
            </ul>
          </div>

          <div className="asa-card p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-tan text-ink-strong">
                <Info className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="asa-eyebrow">صلاحية التنزيل</div>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
              رابط التنزيل المُصدَر في الإنتاج صالح لفترة قصيرة (5–15 دقيقة)
              ولا يمكن لأي طرف غير معتمد الوصول إلى الملف.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function BackToArchiveButton(): JSX.Element {
  return (
    <a
      href="#/archives"
      className="inline-flex w-fit items-center gap-1.5 self-start rounded-md border border-border bg-paper px-4 py-2.5 text-[13.5px] font-semibold text-ink-muted shadow-xs transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
    >
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
      العودة إلى الأرشيف
    </a>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: JSX.Element;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-5 py-3 transition-colors duration-180 ease-out-expo hover:bg-cream-soft/50">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-palm-200 bg-palm-50 text-palm-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {label}
        </div>
        <div
          className={`mt-1 text-[13.5px] text-ink-strong ${mono ? "font-mono ltr-mono tnum" : ""}`}
        >
          {value}
        </div>
      </div>
    </div>
  );
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
