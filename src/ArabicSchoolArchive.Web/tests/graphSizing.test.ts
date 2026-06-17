// Unit tests for the graph sizing policy.
//
// These tests lock down the *production-safe* size math that prevents
// the regression where a single category node would visually swallow
// the whole canvas. The rules under test:
//
//   1. clampNodeSize always returns a finite positive number that is
//      <= NODE_SIZE.absoluteMax. NaN, Infinity, 0, and negative inputs
//      are all safe.
//   2. Category size grows with sqrt(docCount), not linearly. A
//      category with 10_000 documents is not significantly larger
//      than one with 100.
//   3. Category size is always between NODE_SIZE.categoryMin and
//      NODE_SIZE.categoryMax, regardless of docCount.
//   4. The hover/selected inflation is bounded — even an aggressively
//      boosted size never exceeds absoluteMax.
//   5. The reducer returns the clamped size and never an out-of-range
//      value (defence against future regressions in the size source).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampNodeSize,
  makeNodeReducer,
  NODE_SIZE,
} from "../src/ui/components/graph/styles.ts";
import {
  emptyInteractionState,
  type InteractionState,
} from "../src/ui/components/graph/types.ts";

test("clampNodeSize returns 1 for non-finite, zero, or negative inputs", () => {
  assert.equal(clampNodeSize(NaN), 1);
  assert.equal(clampNodeSize(Infinity), 1);
  assert.equal(clampNodeSize(-Infinity), 1);
  assert.equal(clampNodeSize(0), 1);
  assert.equal(clampNodeSize(-5), 1);
});

test("clampNodeSize caps at absoluteMax", () => {
  assert.equal(clampNodeSize(1_000_000), NODE_SIZE.absoluteMax);
  assert.equal(clampNodeSize(NODE_SIZE.absoluteMax + 100), NODE_SIZE.absoluteMax);
});

test("clampNodeSize passes through values in the valid range", () => {
  assert.equal(clampNodeSize(10), 10);
  assert.equal(clampNodeSize(1), 1);
  assert.equal(clampNodeSize(NODE_SIZE.absoluteMax), NODE_SIZE.absoluteMax);
});

test("category size grows with sqrt(docCount), not linearly", () => {
  const state: InteractionState = emptyInteractionState();
  const reducer = makeNodeReducer(() => state);

  const sizeFor = (docCount: number): number => {
    const out = reducer("cat::test", {
      label: "test",
      kind: "category",
      docCount,
      tags: [],
    });
    return out.size as number;
  };

  const s1 = sizeFor(0);
  const s10 = sizeFor(10);
  const s100 = sizeFor(100);
  const s1000 = sizeFor(1000);
  const s10000 = sizeFor(10_000);

  // Floor: 0 documents should still produce at least categoryMin.
  assert.ok(
    s1 >= NODE_SIZE.categoryMin,
    `category with 0 docs should be >= categoryMin (got ${s1})`
  );
  // Cap: 10_000 documents should not exceed categoryMax.
  assert.ok(
    s10000 <= NODE_SIZE.categoryMax,
    `category with 10000 docs should be <= categoryMax (got ${s10000})`
  );
  // sqrt scaling: 10x growth from 100 to 1000 should be much less
  // than 10x in size. sqrt(1000)/sqrt(100) = ~3.16.
  const ratio = s1000 / Math.max(1, s100);
  assert.ok(
    ratio < 3.5,
    `size from 100 → 1000 docs should scale sub-linearly (got ratio ${ratio})`
  );
  // 1000 → 10000 should be heavily damped.
  const ratio2 = s10000 / Math.max(1, s1000);
  assert.ok(
    ratio2 < 2.0,
    `size from 1000 → 10000 docs should be heavily damped (got ratio ${ratio2})`
  );
  // Monotonic non-decreasing.
  assert.ok(s100 >= s10, "size should not decrease as docCount grows");
  assert.ok(s1000 >= s100, "size should not decrease as docCount grows");
});

test("category size is always between categoryMin and categoryMax", () => {
  const state: InteractionState = emptyInteractionState();
  const reducer = makeNodeReducer(() => state);

  for (const docCount of [0, 1, 5, 50, 500, 5000, 50_000]) {
    const out = reducer("cat::test", {
      label: "t",
      kind: "category",
      docCount,
      tags: [],
    });
    const size = out.size as number;
    assert.ok(
      size >= NODE_SIZE.categoryMin && size <= NODE_SIZE.categoryMax,
      `category size ${size} for docCount=${docCount} is outside [${NODE_SIZE.categoryMin}, ${NODE_SIZE.categoryMax}]`
    );
  }
});

test("document size is constant regardless of file kind", () => {
  const state: InteractionState = emptyInteractionState();
  const reducer = makeNodeReducer(() => state);

  for (const fileKind of ["pdf", "doc", "xls", "img", "other"] as const) {
    const out = reducer("doc::test", {
      label: "t",
      kind: "document",
      fileKind,
      tags: [],
    });
    const size = out.size as number;
    assert.ok(
      size >= 1 && size <= NODE_SIZE.absoluteMax,
      `document size ${size} for fileKind=${fileKind} is out of range`
    );
    // Document size should not vary with file kind (visual distinction
    // is via color).
    const other = reducer("doc::test", {
      label: "t",
      kind: "document",
      fileKind: "pdf",
      tags: [],
    });
    assert.equal(
      size,
      other.size,
      `document size should not depend on fileKind (got ${size} vs ${other.size})`
    );
  }
});

test("hover/selected inflation never exceeds absoluteMax", () => {
  // Force the largest possible category size, then make sure the
  // selected boost still caps at absoluteMax.
  const baseState: InteractionState = emptyInteractionState();
  const reducer = makeNodeReducer(() => ({
    ...baseState,
    selectedNodeId: "cat::test",
  }));

  for (const docCount of [0, 1000, 100_000]) {
    const out = reducer("cat::test", {
      label: "t",
      kind: "category",
      docCount,
      tags: [],
    });
    const size = out.size as number;
    assert.ok(
      size <= NODE_SIZE.absoluteMax,
      `selected category size ${size} for docCount=${docCount} exceeded absoluteMax`
    );
    // And the boost is small — at most +30% over the un-boosted size.
    const unboosted = clampNodeSize(NODE_SIZE.categoryMax); // worst case base
    assert.ok(
      size <= unboosted * NODE_SIZE.selectBoost,
      `selected size ${size} for docCount=${docCount} exceeded unboosted*selectBoost`
    );
  }
});

test("reducer returns valid (x, y) for every node shape", () => {
  const state: InteractionState = emptyInteractionState();
  const reducer = makeNodeReducer(() => state);

  for (const attrs of [
    { kind: "category" as const, docCount: 5, x: 1, y: 2 },
    { kind: "document" as const, fileKind: "pdf" as const, x: 0, y: 0 },
    { kind: "document" as const, fileKind: "img" as const, x: -3, y: 4 },
  ]) {
    const out = reducer("n::test", { label: "t", tags: [], ...attrs });
    assert.ok(
      Number.isFinite(out.x) && Number.isFinite(out.y),
      `reducer returned non-finite position: ${out.x}, ${out.y}`
    );
    assert.ok(
      typeof out.size === "number" && out.size > 0 && out.size <= NODE_SIZE.absoluteMax,
      `reducer returned out-of-range size: ${out.size}`
    );
  }
});
