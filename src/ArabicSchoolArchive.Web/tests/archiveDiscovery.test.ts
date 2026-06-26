// Unit tests for the archive discovery layer.
//
// These tests pin the contracts that the Smart Explorer relies on:
//
//   1. `buildFacets` produces a stable, sorted facet set for the categories,
//      years, months, file types, and tags. The same input must always
//      produce the same output (deterministic ordering).
//   2. `buildFacets` correctly tallies needsReview + unclassified counts
//      from the ArchiveItem shape.
//   3. `viewById` / `filtersEqual` keep the saved-views ↔ state mapping
//      stable so the breadcrumb derives the right "active view" id.
//
// The tests deliberately do NOT import React — they exercise the pure
// helpers used by Smart Explorer / Saved View Tabs / Column Navigator.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_VIEWS, filtersEqual, viewById } from "../src/ui/archive/savedViews.ts";
import { buildFacets, getMonthNameAr } from "../src/shared/facets.ts";
import {
  applyOpenGraph,
  applySelectDocument,
} from "../src/ui/archive/useArchiveContext.ts";

function item(overrides: Partial<import("../src/api/contracts.ts").ArchiveItem> = {}): import("../src/api/contracts.ts").ArchiveItem {
  return {
    documentId: "doc",
    schoolId: "school",
    originalName: "test.pdf",
    safeName: "test.pdf",
    blobObjectName: "blob/test.pdf",
    sizeBytes: 1024,
    mimeType: "application/pdf",
    category: "عام",
    displayName: null,
    summary: null,
    tags: [],
    confidence: null,
    needsReview: false,
    uploadedByUserId: "user",
    uploadedAtUtc: "2026-01-01T00:00:00.000Z",
    processingYear: 2026,
    processingMonth: 1,
    ...overrides,
  };
}

test("BUILTIN_VIEWS exposes the expected entrypoints", () => {
  const ids = BUILTIN_VIEWS.map((v) => v.id);
  assert.ok(ids.includes("all"));
  assert.ok(ids.includes("certificates"));
  assert.ok(ids.includes("reports"));
  assert.ok(ids.includes("images"));
  assert.ok(ids.includes("current-year"));
  assert.ok(ids.includes("needs-review"));
  assert.ok(ids.includes("unclassified"));
  assert.ok(ids.includes("recent"));
});

test("viewById returns the right view and undefined for unknown ids", () => {
  const certificates = viewById("certificates");
  assert.ok(certificates);
  assert.equal(certificates?.filters.category, "شهادات");

  const missing = viewById("nope");
  assert.equal(missing, undefined);
});

test("filtersEqual compares deep filter shapes", () => {
  assert.equal(
    filtersEqual({ category: "شهادات" }, { category: "شهادات" }),
    true
  );
  assert.equal(
    filtersEqual({ category: "شهادات" }, { category: "تقارير" }),
    false
  );
  assert.equal(
    filtersEqual(
      { processingYear: 2026, fileType: "img" },
      { processingYear: 2026, fileType: "img" }
    ),
    true
  );
  assert.equal(
    filtersEqual(
      { processingYear: 2026, fileType: "img" },
      { processingYear: 2025, fileType: "img" }
    ),
    false
  );
});

test("getMonthNameAr returns the 12 Hijri/Gregorian Arabic month names", () => {
  assert.equal(getMonthNameAr(1), "يناير");
  assert.equal(getMonthNameAr(6), "يونيو");
  assert.equal(getMonthNameAr(12), "ديسمبر");
  assert.equal(getMonthNameAr(0), "");
  assert.equal(getMonthNameAr(13), "");
});

test("buildFacets tallies categories deterministically", () => {
  const items = [
    item({ documentId: "a", category: "شهادات" }),
    item({ documentId: "b", category: "شهادات" }),
    item({ documentId: "c", category: "تقارير" }),
    item({ documentId: "d", category: null }),
  ];
  const f = buildFacets(items, items.length);
  assert.equal(f.totalCount, 4);
  assert.equal(f.categories.length, 2);
  assert.equal(f.categories[0].name, "شهادات");
  assert.equal(f.categories[0].count, 2);
  assert.equal(f.unclassifiedCount, 1);
});

test("buildFacets groups by year and month with descending sort", () => {
  const items = [
    item({ documentId: "a", processingYear: 2024, processingMonth: 6 }),
    item({ documentId: "b", processingYear: 2026, processingMonth: 1 }),
    item({ documentId: "c", processingYear: 2026, processingMonth: 2 }),
    item({ documentId: "d", processingYear: 2025, processingMonth: 12 }),
  ];
  const f = buildFacets(items, items.length);
  assert.equal(f.years[0].year, 2026);
  assert.equal(f.years[0].count, 2);
  assert.equal(f.years[1].year, 2025);
  assert.equal(f.years[2].year, 2024);
  assert.equal(f.months[0].month, 1);
  assert.equal(f.months[1].month, 2);
});

test("buildFacets counts needsReview and classifies file types", () => {
  const items = [
    item({ documentId: "a", originalName: "x.pdf", needsReview: true }),
    item({ documentId: "b", originalName: "y.docx", needsReview: false }),
    item({ documentId: "c", originalName: "z.xlsx", needsReview: true }),
    item({ documentId: "d", originalName: "p.png", needsReview: false }),
  ];
  const f = buildFacets(items, items.length);
  assert.equal(f.needsReviewCount, 2);
  const types = new Map(f.fileTypes.map((t) => [t.type, t.count]));
  assert.equal(types.get("pdf"), 1);
  assert.equal(types.get("doc"), 1);
  assert.equal(types.get("xls"), 1);
  assert.equal(types.get("img"), 1);
});

test("buildFacets collapses and counts tags", () => {
  const items = [
    item({ documentId: "a", tags: ["درجات", "تقويم"] }),
    item({ documentId: "b", tags: ["درجات", "خطة"] }),
    item({ documentId: "c", tags: ["خطة"] }),
  ];
  const f = buildFacets(items, items.length);
  const tagMap = new Map(f.tags.map((t) => [t.tag, t.count]));
  assert.equal(tagMap.get("درجات"), 2);
  assert.equal(tagMap.get("خطة"), 2);
  assert.equal(tagMap.get("تقويم"), 1);
});

test("buildFacets returns a clean empty shape for an empty input", () => {
  const f = buildFacets([], 0);
  assert.equal(f.totalCount, 0);
  assert.equal(f.categories.length, 0);
  assert.equal(f.years.length, 0);
  assert.equal(f.months.length, 0);
  assert.equal(f.fileTypes.length, 0);
  assert.equal(f.tags.length, 0);
  assert.equal(f.needsReviewCount, 0);
  assert.equal(f.unclassifiedCount, 0);
  assert.equal(f.hasItems, false);
});

/* ──────────────────────────────────────────────────────────────────────
 * Panel visibility — the "no duplicate ghost tabs" contract.
 *
 * The PreviewDrawer (selectedDocumentId) and the LocalGraphDrawer
 * (graphOpenFor) both anchor to the trailing edge of the viewport.
 * If both are open at the same time, their close buttons render
 * side by side at the top of the workspace, which the user perceives
 * as duplicate ghost tabs. The contract is: at most one of them is
 * open at any time. These tests pin that contract.
 * ──────────────────────────────────────────────────────────────────── */

test("applyOpenGraph closes the preview drawer (mutual exclusion)", () => {
  const prev = { selectedDocumentId: "doc-a", graphOpenFor: null };
  const next = applyOpenGraph(prev, "doc-a");
  assert.equal(next.graphOpenFor, "doc-a");
  assert.equal(next.selectedDocumentId, null);
});

test("applyOpenGraph closes the preview even if it was for a different doc", () => {
  const prev = { selectedDocumentId: "doc-a", graphOpenFor: null };
  const next = applyOpenGraph(prev, "doc-b");
  assert.equal(next.graphOpenFor, "doc-b");
  assert.equal(next.selectedDocumentId, null);
});

test("applyOpenGraph(null) only closes the graph, leaves the preview alone", () => {
  const prev = { selectedDocumentId: null, graphOpenFor: "doc-a" };
  const next = applyOpenGraph(prev, null);
  assert.equal(next.graphOpenFor, null);
  assert.equal(next.selectedDocumentId, null);
});

test("applySelectDocument closes the graph when selecting a different document", () => {
  const prev = { selectedDocumentId: null, graphOpenFor: "doc-a" };
  const next = applySelectDocument(prev, "doc-b");
  assert.equal(next.selectedDocumentId, "doc-b");
  assert.equal(next.graphOpenFor, null);
});

test("applySelectDocument is idempotent for the same doc when the graph is open", () => {
  const prev = { selectedDocumentId: null, graphOpenFor: "doc-a" };
  const next = applySelectDocument(prev, "doc-a");
  // We don't want to surface a phantom "open preview for the same doc"
  // state — it would duplicate the chrome. Stay on the graph.
  assert.deepEqual(next, prev);
});

test("applySelectDocument(null) just clears the preview without disturbing the graph", () => {
  const prev = { selectedDocumentId: "doc-a", graphOpenFor: null };
  const next = applySelectDocument(prev, null);
  assert.equal(next.selectedDocumentId, null);
  assert.equal(next.graphOpenFor, null);
});

test("invariant: at most one side panel is open after any transition", () => {
  const cases: Array<{
    prev: { selectedDocumentId: string | null; graphOpenFor: string | null };
    select?: string | null;
    openGraph?: string | null;
  }> = [
    {
      prev: { selectedDocumentId: null, graphOpenFor: null },
      select: "doc-a",
    },
    {
      prev: { selectedDocumentId: "doc-a", graphOpenFor: null },
      openGraph: "doc-a",
    },
    {
      prev: { selectedDocumentId: "doc-a", graphOpenFor: null },
      openGraph: "doc-b",
    },
    {
      prev: { selectedDocumentId: null, graphOpenFor: "doc-a" },
      select: "doc-b",
    },
    {
      prev: { selectedDocumentId: null, graphOpenFor: "doc-a" },
      select: "doc-a",
    },
    {
      prev: { selectedDocumentId: "doc-a", graphOpenFor: null },
      select: null,
    },
    {
      prev: { selectedDocumentId: null, graphOpenFor: "doc-a" },
      openGraph: null,
    },
  ];
  for (const c of cases) {
    let s = c.prev;
    if (c.select !== undefined) s = applySelectDocument(s, c.select);
    if (c.openGraph !== undefined) s = applyOpenGraph(s, c.openGraph);
    const bothOpen = s.selectedDocumentId !== null && s.graphOpenFor !== null;
    assert.equal(bothOpen, false, `both panels open after transition from ${JSON.stringify(c.prev)}`);
  }
});

test("graph seed is independent of preview selection (graph opens with its own id)", () => {
  // After applyOpenGraph, the graphOpenFor is the seed id. The PreviewDrawer
  // would close because selectedDocumentId is null. The graph seed is
  // derived from graphOpenFor, NOT from selectedItem — so it can render
  // even when the preview is closed. This is the model that prevents
  // the "ghost tabs" failure mode where both panels would otherwise
  // derive their seed from the same source.
  const prev = { selectedDocumentId: "doc-a", graphOpenFor: null };
  const next = applyOpenGraph(prev, "doc-a");
  assert.equal(next.graphOpenFor, "doc-a");
  assert.equal(next.selectedDocumentId, null);
});
