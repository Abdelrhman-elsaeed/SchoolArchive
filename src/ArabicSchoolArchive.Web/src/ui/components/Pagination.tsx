import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: PaginationProps): JSX.Element | null {
  if (totalPages <= 1 && totalCount === undefined) return null;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <nav
      className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center"
      aria-label="التنقل بين الصفحات"
    >
      <span className="text-[13.5px] text-ink-muted">
        {typeof totalCount === "number" && (
          <>
            <span className="font-semibold text-ink-strong tnum">
              {totalCount.toLocaleString("ar-SA")}
            </span>
            <span className="mx-1.5 text-ink-soft">·</span>
          </>
        )}
        صفحة <span className="font-semibold text-ink-strong tnum">{page}</span> من{" "}
        <span className="font-semibold text-ink-strong tnum">{totalPages}</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-paper px-3.5 text-[13px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          السابق
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-paper px-3.5 text-[13px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          التالي
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
