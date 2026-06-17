import {
  Clock,
  ShieldX,
  ShieldAlert,
  RefreshCw,
  ListChecks,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { Alert, Button, PageHeader, PageStat, Tag as Pill } from "../components";

export type BlockReason = "Expired" | "Suspended" | "GracePeriod" | "Unknown";

interface SubscriptionBlockedPageProps {
  reason: BlockReason;
  message?: string;
}

export function SubscriptionBlockedPage({
  reason,
  message,
}: SubscriptionBlockedPageProps): JSX.Element {
  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        kicker="حالة الاشتراك"
        title={titleFor(reason)}
        description={subtitleFor(reason)}
        actions={
          <Pill
            tone={reason === "GracePeriod" ? "tan" : "maroon"}
            leadingIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}
          >
            {badgeLabelFor(reason)}
          </Pill>
        }
        stats={
          <>
            <PageStat
              tone={reason === "GracePeriod" ? "tan" : "maroon"}
              label="الحالة الحالية"
              value={badgeLabelFor(reason)}
            />
            <PageStat
              tone="ink"
              label="رقم المدرسة"
              value="—"
            />
            <PageStat
              tone="palm"
              label="المسار التالي"
              value="تواصل مع الإدارة"
            />
          </>
        }
      />

      <div className="asa-card relative overflow-hidden">
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-1 ${
            reason === "GracePeriod"
              ? "bg-gradient-to-l from-tan-500 via-tan to-tan-600"
              : "bg-gradient-to-l from-maroon-500 via-maroon to-maroon-600"
          }`}
        />

        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:gap-6 sm:p-8">
          <ReasonIcon reason={reason} />
          <div className="min-w-0 flex-1">
            <span
              className={`inline-flex h-7 items-center rounded-md border px-2.5 font-kufi text-[10px] uppercase tracking-[0.18em] ${
                reason === "GracePeriod"
                  ? "border-tan-200 bg-tan-50 text-tan-700"
                  : "border-maroon-200 bg-maroon-50 text-maroon-700"
              }`}
            >
              {badgeLabelFor(reason)}
            </span>
            <h1 className="mt-3 font-display text-[22px] font-bold leading-tight tracking-tight text-ink-strong sm:text-[26px]">
              {titleFor(reason)}
            </h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
              {subtitleFor(reason)}
            </p>
          </div>
        </div>

        <div className="space-y-4 border-t border-border px-6 py-6 sm:px-8 sm:py-7">
          <Alert
            variant={reason === "GracePeriod" ? "warning" : "error"}
            title={titleFor(reason)}
          >
            {message ?? defaultMessageFor(reason)}
          </Alert>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="asa-card-soft p-5">
              <h2 className="flex items-center gap-2 font-display text-[14px] font-bold text-ink-strong">
                <HelpCircle className="h-4 w-4 text-oud" aria-hidden="true" />
                ماذا يعني هذا؟
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
                {explanationFor(reason)}
              </p>
            </div>

            <div className="asa-card-soft p-5">
              <h2 className="flex items-center gap-2 font-display text-[14px] font-bold text-ink-strong">
                <ListChecks className="h-4 w-4 text-palm" aria-hidden="true" />
                الخطوات التالية
              </h2>
              <ol className="mt-3 space-y-2.5">
                {stepsFor(reason).map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span
                      dir="ltr"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-palm-200 bg-palm-50 font-display text-[11px] font-bold text-palm-700 tnum"
                    >
                      {idx + 1}
                    </span>
                    <span className="text-[13.5px] leading-relaxed text-ink-muted">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
              leadingIcon={
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              }
            >
              إعادة المحاولة
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReasonIcon({ reason }: { reason: BlockReason }): JSX.Element {
  if (reason === "Expired") {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-maroon-200 bg-maroon-50 text-maroon-500">
        <ShieldX className="h-7 w-7" aria-hidden="true" />
      </span>
    );
  }
  if (reason === "Suspended") {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-maroon-200 bg-maroon-50 text-maroon-500">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </span>
    );
  }
  if (reason === "GracePeriod") {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-tan-200 bg-tan-50 text-tan-600">
        <Clock className="h-7 w-7" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-navy-100 bg-navy-50 text-navy-500">
      <ShieldAlert className="h-7 w-7" aria-hidden="true" />
    </span>
  );
}

function badgeLabelFor(reason: BlockReason): string {
  if (reason === "Expired") return "اشتراك منتهي";
  if (reason === "Suspended") return "اشتراك موقوف";
  if (reason === "GracePeriod") return "مهلة التجديد";
  return "تنبيه";
}

function titleFor(reason: BlockReason): string {
  if (reason === "Expired") return "انتهت صلاحية اشتراك المدرسة";
  if (reason === "Suspended") return "اشتراك المدرسة موقوف";
  if (reason === "GracePeriod") return "يرجى تجديد الاشتراك قريباً";
  return "تعذّر إكمال العملية";
}

function subtitleFor(reason: BlockReason): string {
  if (reason === "Expired")
    return "لن تتمكن من رفع أو استعراض أو تنزيل المستندات حتى يتم التجديد.";
  if (reason === "Suspended")
    return "تم تعليق الاشتراك من قبل إدارة المدرسة. يرجى التواصل معهم لإعادة التفعيل.";
  if (reason === "GracePeriod")
    return "ما زال بإمكانك استخدام الأرشيف حالياً. يرجى التجديد قبل انتهاء المهلة.";
  return "يرجى التواصل مع إدارة المدرسة.";
}

function defaultMessageFor(reason: BlockReason): string {
  if (reason === "Expired")
    return "انتهت صلاحية اشتراك المدرسة. يرجى تجديد الاشتراك للوصول إلى الأرشيف.";
  if (reason === "Suspended")
    return "تم تعليق اشتراك المدرسة. يرجى التواصل مع إدارة المدرسة لإعادة التفعيل.";
  if (reason === "GracePeriod")
    return "اشتراكك في مهلة التجديد. يرجى التجديد قبل انتهاء المهلة لضمان استمرار الخدمة.";
  return "يرجى التواصل مع إدارة المدرسة.";
}

function explanationFor(reason: BlockReason): string {
  if (reason === "Expired")
    return "تعتمد المدرسة على اشتراك سنوي لتفعيل خدمة الأرشيف. عند انتهاء الاشتراك، يتم إيقاف جميع العمليات على الأرشيف حتى يتم التجديد.";
  if (reason === "Suspended")
    return "يتم تعليق الاشتراك عند وجود مخالفة للسياسة أو لأغراض إدارية. لإعادة التفعيل، يرجى التواصل مع إدارة المدرسة.";
  if (reason === "GracePeriod")
    return "يدخل الاشتراك في مهلة سماح قصيرة بعد تاريخ الانتهاء. خلال هذه المهلة، تستمر الخدمة بشكل طبيعي، ولكن يجب التجديد قبل انتهائها.";
  return "تعذّر تحديد حالة الاشتراك. يرجى التواصل مع إدارة المدرسة.";
}

function stepsFor(reason: BlockReason): string[] {
  if (reason === "Expired")
    return [
      "تواصل مع إدارة المدرسة لتأكيد حالة التجديد.",
      "بعد التجديد، سيتم تحديث حالة الاشتراك تلقائياً.",
      "اضغط «إعادة المحاولة» أو حدّث الصفحة بعد تأكيد التجديد.",
    ];
  if (reason === "Suspended")
    return [
      "تواصل مع إدارة المدرسة لمعرفة سبب التعليق.",
      "بعد معالجة السبب، ستتم إعادة تفعيل الخدمة من قِبَل الإدارة.",
      "اضغط «إعادة المحاولة» بعد تأكيد إعادة التفعيل.",
    ];
  if (reason === "GracePeriod")
    return [
      "تابع مع إدارة المدرسة لتجديد الاشتراك قبل انتهاء المهلة.",
      "استمر في استخدام الخدمة بحذر خلال المهلة.",
      "لن تتأثر العمليات الحالية قبل انتهاء المهلة.",
    ];
  return [
    "تواصل مع إدارة المدرسة.",
    "اضغط «إعادة المحاولة» بعد المحاولة.",
  ];
}
