// Build the graph dataset (nodes + links) from a flat list of archive items.
//
// This module is the *single* place where ArchiveItem → GraphNode/GraphLink
// mapping happens. It is purely functional and easy to unit-test (see
// `tests/graphMapping.test.ts`).
//
// Two design choices prevent the "blob" effect at high node counts:
//
//  1. Tag bridges are deduped: each document keeps at most
//     `MAX_TAG_BRIDGES_PER_DOC` cross-document tag links, prioritised
//     by tag weight (rarest shared tag = strongest bridge). This keeps
//     the edge count O(N * maxBridges) rather than O(N²).
//
//  2. Deterministic seeded initial positions keep documents clustered
//     around their category hub. The ForceAtlas2 layout in `layout.ts`
//     uses these as a starting point so the simulation converges to
//     a stable, *visually meaningful* configuration quickly.
//
// Defensive data validation
// -------------------------
// The runtime contract (TypeScript) says every ArchiveItem has a `documentId`,
// but real API responses can occasionally ship with missing/empty ids. We
// drop malformed nodes/links explicitly here so the resulting graph is
// always self-consistent (every link endpoint resolves to an existing node).

import type { ArchiveItem } from "../../../api/contracts";
import {
  CATEGORY_ID,
  classifyFile,
  isArchiveWithCategory,
  normalizeTag,
} from "./styles.ts";
import type {
  DocFileKind,
  GraphData,
  GraphLink,
  GraphNode,
  GraphStats,
} from "./types.ts";

const MAX_TAG_BRIDGES_PER_DOC = 4;

interface CategoryAggregate {
  name: string;
  count: number;
  documents: ArchiveItem[];
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

function safeId(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

/**
 * Build a graph dataset from a list of archive items.
 *
 * Guarantees:
 *  - never throws on malformed inputs
 *  - returned links always reference existing node ids
 *  - items with missing documentId or empty category are dropped
 *  - tag bridges are dedup'd per unordered pair of documents
 */
export function buildGraph(items: ArchiveItem[]): GraphData {
  // 1. Filter to items with a usable category + documentId.
  const withCategory = items.filter((it) => {
    if (!isArchiveWithCategory(it)) return false;
    return safeId(it.documentId) !== "";
  });

  // 2. Group documents by category.
  const categoryMap = new Map<string, CategoryAggregate>();
  for (const it of withCategory) {
    const cat = it.category as string;
    let agg = categoryMap.get(cat);
    if (!agg) {
      agg = { name: cat, count: 0, documents: [] };
      categoryMap.set(cat, agg);
    }
    agg.count += 1;
    agg.documents.push(it);
  }

  const categories = Array.from(categoryMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // 3. Seed category hubs on a circle (used by the layout as the
  //    starting point). We keep the polar layout so categories stay
  //    visually grouped before FA2 has had a chance to balance.
  const categoryCount = Math.max(1, categories.length);
  const layoutRadius = 80 + Math.sqrt(categoryCount) * 80;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const angle = (i / categoryCount) * Math.PI * 2 - Math.PI / 2;
    const node: GraphNode & { x?: number; y?: number } = {
      id: CATEGORY_ID(cat.name),
      label: cat.name,
      kind: "category",
      docCount: cat.count,
    };
    node.x = Math.cos(angle) * layoutRadius;
    node.y = Math.sin(angle) * layoutRadius;
    nodes.push(node);
  }

  // 4. Place documents around their category hub.
  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    const hubAngle = (ci / categoryCount) * Math.PI * 2 - Math.PI / 2;
    const hubX = Math.cos(hubAngle) * layoutRadius;
    const hubY = Math.sin(hubAngle) * layoutRadius;

    for (let i = 0; i < cat.documents.length; i++) {
      const it = cat.documents[i];
      const docId = safeId(it.documentId);
      if (!docId) continue;
      const fileKind: DocFileKind = classifyFile(it.originalName);
      const node: GraphNode & { x?: number; y?: number } = {
        id: docId,
        label: it.displayName ?? it.originalName ?? docId,
        kind: "document",
        fileKind,
        documentId: docId,
        category: it.category,
        tags: it.tags ?? [],
      };
      const ringRadius = 60 + Math.sqrt(cat.count) * 18;
      const a = (i / Math.max(1, cat.count)) * Math.PI * 2;
      const rand = mulberry32(hashString(docId));
      const jitter = 0.55 + rand() * 0.5;
      node.x = hubX + Math.cos(a) * ringRadius * jitter;
      node.y = hubY + Math.sin(a) * ringRadius * jitter;
      nodes.push(node);
      links.push({
        source: docId,
        target: CATEGORY_ID(cat.name),
        kind: "category",
        weight: 1,
      });
    }
  }

  // 5. Build a tag → document index from the filtered set.
  const validNodeIds = new Set(nodes.map((n) => n.id));
  const tagToDocs = new Map<string, string[]>();
  for (const it of withCategory) {
    const docId = safeId(it.documentId);
    if (!docId) continue;
    const tags = (it.tags ?? []).map(normalizeTag).filter(Boolean);
    for (const tag of tags) {
      const list = tagToDocs.get(tag) ?? [];
      list.push(docId);
      tagToDocs.set(tag, list);
    }
  }

  // 6. Smart tag-bridge dedup (rarest tag first → strongest bridge).
  const bridgesPerDoc = new Map<
    string,
    Array<{ otherDocId: string; tag: string; score: number }>
  >();
  for (const [tag, docs] of tagToDocs.entries()) {
    if (docs.length < 2) continue;
    const score = 1 / docs.length;
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const a = docs[i];
        const b = docs[j];
        if (!validNodeIds.has(a) || !validNodeIds.has(b)) continue;
        const push = (from: string, to: string): void => {
          let arr = bridgesPerDoc.get(from);
          if (!arr) {
            arr = [];
            bridgesPerDoc.set(from, arr);
          }
          arr.push({ otherDocId: to, tag, score });
          arr.sort(
            (x, y) =>
              y.score - x.score || x.otherDocId.localeCompare(y.otherDocId)
          );
          if (arr.length > MAX_TAG_BRIDGES_PER_DOC) {
            arr.length = MAX_TAG_BRIDGES_PER_DOC;
          }
        };
        push(a, b);
        push(b, a);
      }
    }
  }

  // 7. Emit dedup'd tag links.
  const seenTagLinks = new Set<string>();
  for (const [from, bridges] of bridgesPerDoc.entries()) {
    for (const b of bridges) {
      if (!validNodeIds.has(from) || !validNodeIds.has(b.otherDocId)) continue;
      const key =
        from < b.otherDocId
          ? `${from}|${b.otherDocId}`
          : `${b.otherDocId}|${from}`;
      if (seenTagLinks.has(key)) continue;
      seenTagLinks.add(key);
      links.push({
        source: from,
        target: b.otherDocId,
        kind: "tag",
        sharedTag: b.tag,
        weight: b.score,
      });
    }
  }

  return { nodes, links };
}

/** Cheap stats used by the toolbar — O(N) but N is bounded. */
export function computeStats(data: GraphData): GraphStats {
  let documents = 0;
  let categories = 0;
  let tagBridges = 0;
  for (const n of data.nodes) {
    if (!n) continue;
    if (n.kind === "category") categories += 1;
    else if (n.kind === "document") documents += 1;
  }
  for (const l of data.links) {
    if (l && l.kind === "tag") tagBridges += 1;
  }
  return { documents, categories, tagBridges };
}
