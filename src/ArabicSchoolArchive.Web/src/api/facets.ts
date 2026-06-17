// Pure facet builder. Kept dependency-free so it can be unit-tested
// from `node --test` without dragging React/TSX context modules into
// the test runner.

import type { ArchiveItem } from "./contracts";

export interface CategoryFacet {
  name: string;
  count: number;
}
export interface YearFacet {
  year: number;
  count: number;
}
export interface MonthFacet {
  month: number;
  count: number;
}
export interface FileTypeFacet {
  type: "pdf" | "doc" | "xls" | "img" | "other";
  label: string;
  count: number;
}
export interface TagFacet {
  tag: string;
  count: number;
}

export interface ArchiveFacets {
  totalCount: number;
  categories: CategoryFacet[];
  years: YearFacet[];
  months: MonthFacet[];
  fileTypes: FileTypeFacet[];
  tags: TagFacet[];
  needsReviewCount: number;
  unclassifiedCount: number;
  hasItems: boolean;
  sample: ArchiveItem[];
}

const FILE_TYPE_LABEL: Record<FileTypeFacet["type"], string> = {
  pdf: "PDF",
  doc: "Word",
  xls: "Excel",
  img: "صور",
  other: "ملفات أخرى",
};

function classifyFile(name: string): FileTypeFacet["type"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "doc";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "xls";
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    return "img";
  return "other";
}

export function fileTypeLabel(t: FileTypeFacet["type"]): string {
  return FILE_TYPE_LABEL[t];
}

export function getMonthNameAr(m: number): string {
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

export function buildFacets(
  items: ArchiveItem[],
  totalCount: number
): ArchiveFacets {
  const catMap = new Map<string, number>();
  const yearMap = new Map<number, number>();
  const monthMap = new Map<number, number>();
  const typeMap = new Map<FileTypeFacet["type"], number>();
  const tagMap = new Map<string, number>();
  let needsReview = 0;
  let unclassified = 0;

  for (const it of items) {
    if (it.category && it.category.trim().length > 0) {
      catMap.set(it.category, (catMap.get(it.category) ?? 0) + 1);
    } else {
      unclassified += 1;
    }
    const y = it.processingYear;
    yearMap.set(y, (yearMap.get(y) ?? 0) + 1);
    const m = it.processingMonth;
    if (m >= 1 && m <= 12) {
      monthMap.set(m, (monthMap.get(m) ?? 0) + 1);
    }
    const t = classifyFile(it.originalName);
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    if (it.needsReview) needsReview += 1;
    for (const t of it.tags ?? []) {
      const key = t.trim();
      if (!key) continue;
      tagMap.set(key, (tagMap.get(key) ?? 0) + 1);
    }
  }

  const categories: CategoryFacet[] = Array.from(catMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"));

  const years: YearFacet[] = Array.from(yearMap.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);

  const months: MonthFacet[] = Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => b.count - a.count || a.month - b.month);

  const fileTypes: FileTypeFacet[] = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, label: FILE_TYPE_LABEL[type], count }))
    .sort((a, b) => b.count - a.count);

  const tags: TagFacet[] = Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ar"))
    .slice(0, 60);

  return {
    totalCount,
    categories,
    years,
    months,
    fileTypes,
    tags,
    needsReviewCount: needsReview,
    unclassifiedCount: unclassified,
    hasItems: items.length > 0,
    sample: items,
  };
}
