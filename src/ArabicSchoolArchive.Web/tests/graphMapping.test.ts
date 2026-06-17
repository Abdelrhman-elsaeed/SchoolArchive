// Unit tests for the graph dataset builder. These tests lock the safety
// contract that the page-level regression depended on:
//
//   1. `buildGraph` must NEVER throw on any input shape.
//   2. The returned graph must be self-consistent: every link.source /
//      link.target resolves to an existing node.id.
//   3. Items with missing or empty documentId are dropped (defence against
//      d3-force-3d's `"node not found"` throw).
//   4. Tag bridges are dedup'd: no link is emitted more than once for the
//      same unordered pair of document ids.
//   5. The empty array case returns an empty graph without throwing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../src/ui/components/graph/buildGraph.ts";
import type { ArchiveItem } from "../src/api/contracts.ts";

function item(overrides: Partial<ArchiveItem> = {}): ArchiveItem {
  return {
    documentId: "doc-1",
    schoolId: "school-1",
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
    uploadedByUserId: "user-1",
    uploadedAtUtc: "2026-01-01T00:00:00.000Z",
    processingYear: 2026,
    processingMonth: 1,
    ...overrides,
  };
}

test("buildGraph returns empty graph for empty input", () => {
  const g = buildGraph([]);
  assert.deepEqual(g.nodes, []);
  assert.deepEqual(g.links, []);
});

test("buildGraph does not throw on malformed field values", () => {
  // Simulate a real-world malformed payload where documentId is missing
  // or whitespace, or category is null.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = [
    {
      documentId: undefined,
      category: "عام",
      tags: ["a"],
      originalName: "a.pdf",
    },
    {
      category: null,
      tags: [],
      originalName: "b.pdf",
    },
    {
      documentId: "  ",
      category: "تقارير",
      tags: ["b"],
      originalName: "c.pdf",
    },
  ];
  const g = buildGraph(items as ArchiveItem[]);
  // All malformed items must be dropped, leaving an empty graph.
  assert.equal(g.nodes.length, 0);
  assert.equal(g.links.length, 0);
});

test("buildGraph keeps valid items and produces self-consistent node/link ids", () => {
  const items: ArchiveItem[] = [
    item({ documentId: "d1", category: "عام", tags: ["alpha"] }),
    item({ documentId: "d2", category: "عام", tags: ["alpha"] }),
    item({ documentId: "d3", category: "تقارير", tags: ["beta"] }),
  ];
  const g = buildGraph(items);
  const ids = new Set(g.nodes.map((n) => n.id));
  // Every link endpoint must resolve to a node id.
  for (const link of g.links) {
    assert.ok(ids.has(link.source), `link.source "${link.source}" is not a known node`);
    assert.ok(ids.has(link.target), `link.target "${link.target}" is not a known node`);
  }
  // We expect 2 category hubs + 3 document nodes.
  const categories = g.nodes.filter((n) => n.kind === "category");
  const documents = g.nodes.filter((n) => n.kind === "document");
  assert.equal(categories.length, 2);
  assert.equal(documents.length, 3);
});

test("buildGraph emits a category link per document", () => {
  const items: ArchiveItem[] = [
    item({ documentId: "d1", category: "عام" }),
    item({ documentId: "d2", category: "عام" }),
    item({ documentId: "d3", category: "تقارير" }),
  ];
  const g = buildGraph(items);
  const categoryLinks = g.links.filter((l) => l.kind === "category");
  assert.equal(categoryLinks.length, 3);
});

test("buildGraph dedups tag bridges per unordered pair", () => {
  const items: ArchiveItem[] = [
    item({ documentId: "d1", category: "عام", tags: ["shared"] }),
    item({ documentId: "d2", category: "تقارير", tags: ["shared"] }),
    item({ documentId: "d3", category: "شهادات", tags: ["shared"] }),
  ];
  const g = buildGraph(items);
  const tagLinks = g.links.filter((l) => l.kind === "tag");
  // Three docs sharing one tag → C(3, 2) = 3 unique pairs.
  assert.equal(tagLinks.length, 3);
  // Verify each pair is unique.
  const seen = new Set<string>();
  for (const l of tagLinks) {
    const key = l.source < l.target ? `${l.source}|${l.target}` : `${l.target}|${l.source}`;
    assert.ok(!seen.has(key), `duplicate pair ${key}`);
    seen.add(key);
  }
});

test("buildGraph never emits links to missing nodes", () => {
  // Documents that share a tag but one has an empty category. The empty-
  // category one is filtered out, the tag index is built from the same
  // filtered set, so no dangling links should exist.
  const items: ArchiveItem[] = [
    item({ documentId: "d1", category: "عام", tags: ["x"] }),
    item({ documentId: "d2", category: "", tags: ["x"] }),
  ];
  const g = buildGraph(items);
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const link of g.links) {
    assert.ok(ids.has(link.source), `dangling source ${link.source}`);
    assert.ok(ids.has(link.target), `dangling target ${link.target}`);
  }
});
