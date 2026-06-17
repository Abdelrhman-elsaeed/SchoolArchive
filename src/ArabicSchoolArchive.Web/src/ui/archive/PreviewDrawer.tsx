import { useEffect, useMemo } from "react";
import {
  X,
  Calendar,
  HardDrive,
  Tag as TagIcon,
  Sparkles,
  AlertTriangle,
  Download,
  Network,
  Share2,
  Printer,
  ChevronLeft,
  ExternalLink,
  Hash,
  User as UserIcon,
  FileSearch,
} from "lucide-react";
import type { ArchiveItem } from "../../api/contracts";
import { formatBytes, formatDate } from "../components/DocumentCard";
import { fileTypeMeta } from "./DocumentRow";

interface PreviewDrawerProps {
  item: ArchiveItem | null;
  related: ArchiveItem[];
  onClose: () => void;
  onOpenGraph: (id: string) => void;
  onCategoryClick: (cat: string) => void;
  onTagClick: (tag: string) => void;
  onDocumentOpen: (id: string) => void;
  onDownload?: (id: string) => void;
}

export function PreviewDrawer({
  item,
  related,
  onClose,
  onOpenGraph,
  onCategoryClick,
  onTagClick,
  onDocumentOpen,
  onDownload,
}: PreviewDrawerProps): JSX.Element {
  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (!item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [item]);

  // Esc closes
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  return (
    <aside
      aria-hidden={!item}
      aria-label="معاينة المستند"
      className={`pointer-events-none fixed inset-y-0 end-0 z-40 flex w-full max-w-[420px] flex-col border-l border-border bg-paper transition-transform duration-260 ease-out-expo ${
        item ? "translate-x-0 pointer-events-auto" : "translate-x-full"
      }`}
      style={{
        insetInlineStart: "0",
        insetInlineEnd: "auto",
        transform: item ? "translateX(0)" : "translateX(100%)",
        borderLeft: "1px solid var(--asa-border)",
        borderRight: "none",
      }}
    >
      <PreviewHeader item={item} onClose={onClose} />
      {item ? (
        <PreviewBody
          item={item}
          related={related}
          onOpenGraph={onOpenGraph}
          onCategoryClick={onCategoryClick}
          onTagClick={onTagClick}
          onDocumentOpen={onDocumentOpen}
          onDownload={onDownload}
        />
      ) : (
        <PreviewPlaceholder />
      )}
    </aside>
  );
}

function PreviewHeader({
  item,
  onClose,
}: {
  item: ArchiveItem | null;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-cream-soft/50 px-5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="font-kufi text-[10.5px] uppercase tracking-[0.22em] text-tan-700"
        >
          معاينة المستند
        </span>
        {item && (
          <span className="font-mono text-[10px] text-ink-soft tnum">
            {item.documentId.slice(0, 8)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-paper text-ink-muted transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
        aria-label="إغلاق المعاينة"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function PreviewPlaceholder(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-ink-soft">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-soft">
        <FileSearch className="h-5 w-5 text-ink-soft" aria-hidden="true" />
      </div>
      <p className="text-[13.5px]">
        اختر مستنداً من القائمة لرؤية تفاصيله وروابطه هنا.
      </p>
    </div>
  );
}

function PreviewBody({
  item,
  related,
  onOpenGraph,
  onCategoryClick,
  onTagClick,
  onDocumentOpen,
  onDownload,
}: Omit<PreviewDrawerProps, "onClose" | "item" | "related"> & {
  item: ArchiveItem;
  related: ArchiveItem[];
}): JSX.Element {
  const { Icon, tileBg, tileText, tileBorder, typeLabel } = fileTypeMeta(
    item.originalName
  );
  const title = item.displayName ?? item.originalName;
  const showSubtitle = !!item.displayName && item.displayName !== item.originalName;

  const confidencePct = useMemo(() => {
    if (item.confidence == null) return null;
    return Math.max(0, Math.min(1, item.confidence)) * 100;
  }, [item.confidence]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
        <div className="flex flex-col gap-5">
          {/* Hero */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md border ${tileBg} ${tileText} ${tileBorder}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 font-display text-[18px] font-bold leading-tight text-ink-strong">
                  {title}
                </h2>
                {showSubtitle && (
                  <p
                    className="mt-1 truncate text-[12px] text-ink-soft ltr-mono"
                    dir="ltr"
                  >
                    {item.originalName}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill>{typeLabel}</Pill>
              <Pill tone="ink">{item.processingYear}</Pill>
              {item.displayName && (
                <Pill tone="tan" icon={<Sparkles className="h-3 w-3" />}>
                  عنوان مقترح
                </Pill>
              )}
              {item.needsReview && (
                <Pill tone="maroon" icon={<AlertTriangle className="h-3 w-3" />}>
                  يحتاج مراجعة
                </Pill>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => onDownload?.(item.documentId)}
            >
              تنزيل
            </ActionButton>
            <ActionButton
              icon={<Network className="h-3.5 w-3.5" />}
              onClick={() => onOpenGraph(item.documentId)}
            >
              الشبكة المحلية
            </ActionButton>
            <ActionButton icon={<Share2 className="h-3.5 w-3.5" />}>
              مشاركة
            </ActionButton>
            <ActionButton icon={<Printer className="h-3.5 w-3.5" />}>
              طباعة
            </ActionButton>
          </div>

          {/* Summary */}
          {item.summary ? (
            <Section title="ملخص المستند" kicker="ملخص آلي">
              <p className="text-[13.5px] leading-relaxed text-ink-muted">
                {item.summary}
              </p>
            </Section>
          ) : (
            <Section title="ملخص المستند" kicker="ملخص آلي">
              <p className="text-[12.5px] italic text-ink-soft">
                لا يوجد ملخص متاح بعد لهذا المستند.
              </p>
            </Section>
          )}

          {/* Metadata table */}
          <Section title="البيانات الوصفية" kicker="تفاصيل">
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border">
              <MetaRow
                label="التصنيف"
                icon={<TagIcon className="h-3.5 w-3.5" />}
                value={
                  item.category ? (
                    <button
                      type="button"
                      onClick={() => onCategoryClick(item.category!)}
                      className="text-palm-700 transition-colors duration-180 ease-out-expo hover:text-palm"
                    >
                      {item.category}
                    </button>
                  ) : (
                    <span className="text-ink-soft">غير مصنف</span>
                  )
                }
              />
              <MetaRow
                label="السنة / الشهر"
                icon={<Calendar className="h-3.5 w-3.5" />}
                value={
                  <span className="tnum">
                    {item.processingYear} · {monthNameAr(item.processingMonth)}
                  </span>
                }
              />
              <MetaRow
                label="الحجم"
                icon={<HardDrive className="h-3.5 w-3.5" />}
                value={<span className="tnum">{formatBytes(item.sizeBytes)}</span>}
              />
              <MetaRow
                label="تاريخ الرفع"
                icon={<Calendar className="h-3.5 w-3.5" />}
                value={
                  <span className="tnum">
                    {formatDate(item.uploadedAtUtc)}
                  </span>
                }
              />
              <MetaRow
                label="المعرّف"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={
                  <span className="font-mono tnum text-[11.5px] text-ink-soft ltr-mono" dir="ltr">
                    {item.documentId}
                  </span>
                }
              />
              <MetaRow
                label="رفعه"
                icon={<UserIcon className="h-3.5 w-3.5" />}
                value={
                  <span className="font-mono text-[11.5px] text-ink-soft ltr-mono" dir="ltr">
                    {item.uploadedByUserId}
                  </span>
                }
              />
            </dl>
          </Section>

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <Section title="الوسوم" kicker={`${item.tags.length} وسم`}>
              <div className="flex flex-wrap items-center gap-1.5">
                {item.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTagClick(t)}
                    className="inline-flex h-6 items-center rounded-md border border-border bg-cream-soft px-2 text-[11.5px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:border-palm-200 hover:bg-palm-50 hover:text-palm-700"
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Confidence meter */}
          {confidencePct != null && (
            <Section title="ثقة التحليل" kicker={`${Math.round(confidencePct)}%`}>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-cream-soft">
                <div
                  className="absolute inset-y-0 start-0 rounded-full bg-palm"
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-ink-soft">
                قيمة الثقة التي حددها المحرك لهذا المستند.
              </p>
            </Section>
          )}

          {/* Related */}
          {related.length > 0 && (
            <Section title="مستندات ذات صلة" kicker="روابط سياقية">
              <ul className="flex flex-col">
                {related.slice(0, 6).map((r) => {
                  const meta = fileTypeMeta(r.originalName);
                  return (
                    <li key={r.documentId}>
                      <button
                        type="button"
                        onClick={() => onDocumentOpen(r.documentId)}
                        className="group flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-2 text-start transition-colors duration-180 ease-out-expo hover:border-border-soft hover:bg-cream-soft/60"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${meta.tileBg} ${meta.tileText} ${meta.tileBorder}`}
                        >
                          <meta.Icon
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-ink-strong group-hover:text-palm-700">
                            {r.displayName ?? r.originalName}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[10.5px] text-ink-soft">
                            {r.category && (
                              <span className="text-palm-700">
                                #{r.category}
                              </span>
                            )}
                            <span className="font-mono tnum">
                              {r.processingYear}
                            </span>
                          </span>
                        </span>
                        <ChevronLeft
                          className="h-3.5 w-3.5 text-ink-soft opacity-0 transition-opacity duration-180 ease-out-expo group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => onOpenGraph(item.documentId)}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-palm-700 transition-colors duration-180 ease-out-expo hover:text-palm"
              >
                <Network className="h-3.5 w-3.5" aria-hidden="true" />
                عرض كل الروابط في الرسم البياني
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </button>
            </Section>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-cream-soft/50 px-5 py-3">
        <button
          type="button"
          onClick={() => onDocumentOpen(item.documentId)}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-palm bg-palm px-4 font-display text-[13.5px] font-semibold text-white shadow-palm transition-colors duration-180 ease-out-expo hover:bg-palm-600"
        >
          فتح صفحة المستند
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[13.5px] font-bold text-ink-strong">
          {title}
        </h3>
        {kicker && (
          <span className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {kicker}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function MetaRow({
  label,
  icon,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5 bg-paper px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-cream-soft text-ink-soft">
        {icon}
      </span>
      <span className="font-kufi text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">
        {label}
      </span>
      <span className="ms-auto truncate text-[12.5px] font-semibold text-ink-strong">
        {value}
      </span>
    </div>
  );
}

function Pill({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "palm" | "tan" | "ink" | "oud" | "maroon";
  icon?: React.ReactNode;
}): JSX.Element {
  const tones: Record<string, string> = {
    neutral: "border-border bg-cream-soft text-ink-strong",
    palm: "border-palm-200 bg-palm-50 text-palm-700",
    tan: "border-tan-200 bg-tan-50 text-tan-700",
    ink: "border-navy-100 bg-navy-50 text-ink-strong",
    oud: "border-oud-100 bg-oud-50 text-oud",
    maroon: "border-maroon-200 bg-maroon-50 text-maroon-600",
  };
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

function ActionButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-paper px-3 text-[12px] font-semibold text-ink-muted transition-all duration-180 ease-out-expo hover:border-palm-200 hover:bg-palm-50 hover:text-palm-700 active:scale-[0.985]"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function monthNameAr(m: number): string {
  const names = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  return names[m - 1] ?? "";
}

// Re-exported to keep the import site clean
export { Pill as _Pill };
