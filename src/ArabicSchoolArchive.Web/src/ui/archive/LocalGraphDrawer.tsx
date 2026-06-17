import { useEffect, useMemo, useRef, useState } from "react";
import { X, Network, FileText, Hash, Tag as TagIcon, Layers, ChevronLeft } from "lucide-react";
import type { ArchiveItem } from "../../api/contracts";
import { classifyFile, normalizeTag } from "../components/graph/styles";
import type { GraphData, GraphLink, GraphNode, GraphStats } from "../components/graph/types";
import { GraphRenderer } from "../components/graph/renderer";
import { buildGraphology } from "../components/graph/layout";

interface LocalGraphDrawerProps {
  /** The currently selected document (the seed of the local graph). */
  seed: ArchiveItem | null;
  /** All available archive items (capped page-size). */
  pool: ArchiveItem[];
  onClose: () => void;
  onOpenDocument: (id: string) => void;
  onCategoryClick: (cat: string) => void;
  onTagClick: (tag: string) => void;
}

const MAX_NEIGHBORS = 14;

function buildLocalGraph(seed: ArchiveItem, pool: ArchiveItem[]): GraphData {
  // Coarse scoring: same category = 3, same year = 2, shared tag = 1.
  const seedTagsArr: string[] = (seed.tags ?? []).map((t) => normalizeTag(t));
  const seedTags = new Set<string>(seedTagsArr);
  const scored = pool
    .filter((it) => it.documentId !== seed.documentId)
    .map((it) => {
      let s = 0;
      if (it.category && it.category === seed.category) s += 3;
      if (it.processingYear === seed.processingYear) s += 2;
      const shared = it.tags ?? [];
      const sharedCount = shared.filter((t) => seedTags.has(normalizeTag(t))).length;
      s += sharedCount;
      return { item: it, score: s, sharedCount };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_NEIGHBORS);

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  nodes.push({
    id: seed.documentId,
    label: seed.displayName ?? seed.originalName,
    kind: "document",
    fileKind: classifyFile(seed.originalName),
    documentId: seed.documentId,
    category: seed.category,
    tags: seed.tags ?? [],
  });

  // Map from doc id → the matched neighbor entry
  const byId = new Map<string, { item: ArchiveItem; score: number; sharedCount: number }>();
  for (const n of scored) byId.set(n.item.documentId, n);

  // Add category hub (if any) as a small node connected to seed and matching docs
  if (seed.category) {
    const catId = `cat::${seed.category}`;
    nodes.push({
      id: catId,
      label: seed.category,
      kind: "category",
      docCount: scored.filter((s) => s.item.category === seed.category).length + 1,
    });
    links.push({
      source: seed.documentId,
      target: catId,
      kind: "category",
      weight: 1,
    });
    for (const n of scored) {
      if (n.item.category === seed.category) {
        links.push({
          source: n.item.documentId,
          target: catId,
          kind: "category",
          weight: 1,
        });
      }
    }
  }

  // Add year hub
  const yearId = `year::${seed.processingYear}`;
  nodes.push({
    id: yearId,
    label: String(seed.processingYear),
    kind: "category",
    docCount: scored.filter((s) => s.item.processingYear === seed.processingYear).length + 1,
  });
  links.push({
    source: seed.documentId,
    target: yearId,
    kind: "category",
    weight: 1,
  });

  // Add each neighbor document
  for (const n of scored) {
    const m = classifyFile(n.item.originalName);
    nodes.push({
      id: n.item.documentId,
      label: n.item.displayName ?? n.item.originalName,
      kind: "document",
      fileKind: m,
      documentId: n.item.documentId,
      category: n.item.category,
      tags: n.item.tags ?? [],
    });
    links.push({
      source: seed.documentId,
      target: n.item.documentId,
      kind: "tag",
      weight: 1,
      sharedTag: n.sharedCount > 0 ? firstSharedTag(n.item, seedTags) : "year",
    });
  }

  return { nodes, links };
}

function firstSharedTag(item: ArchiveItem, seedTags: Set<string>): string {
  for (const t of item.tags ?? []) {
    if (seedTags.has(normalizeTag(t))) return t;
  }
  return "year";
}

function computeStatsLocal(d: GraphData): GraphStats {
  let documents = 0;
  let categories = 0;
  let tagBridges = 0;
  for (const n of d.nodes) {
    if (n.kind === "category") categories += 1;
    else documents += 1;
  }
  for (const l of d.links) {
    if (l.kind === "tag") tagBridges += 1;
  }
  return { documents, categories, tagBridges };
}

export function LocalGraphDrawer({
  seed,
  pool,
  onClose,
  onOpenDocument,
  onCategoryClick,
  onTagClick,
}: LocalGraphDrawerProps): JSX.Element {
  const data = useMemo<GraphData | null>(
    () => (seed ? buildLocalGraph(seed, pool) : null),
    [seed, pool]
  );
  const stats = useMemo<GraphStats | null>(
    () => (data ? computeStatsLocal(data) : null),
    [data]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const dataSignatureRef = useRef<string>("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const el = containerRef.current;
    if (!el) return;

    // Build + render
    if (!rendererRef.current) {
      rendererRef.current = new GraphRenderer({ container: el });
    }
    const renderer = rendererRef.current;

    const sigma = renderer.getSigma();
    const onEnter = (p: { node: string }): void => setHoveredId(p.node);
    const onLeave = (): void => setHoveredId(null);
    const onClick = (p: { node: string }): void => {
      const g = renderer.getGraph();
      if (!g.hasNode(p.node)) return;
      const a = g.getNodeAttributes(p.node);
      if (a.kind === "category") {
        // For local graph, category/year hubs act like filters in the parent
        onCategoryClick(a.label);
        return;
      }
      if (a.documentId) onOpenDocument(a.documentId);
    };
    sigma.on("enterNode", onEnter);
    sigma.on("leaveNode", onLeave);
    sigma.on("clickNode", onClick);
    return () => {
      try {
        sigma.off("enterNode", onEnter);
        sigma.off("leaveNode", onLeave);
        sigma.off("clickNode", onClick);
      } catch {
        /* noop */
      }
    };
  }, [data, onCategoryClick, onOpenDocument]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !data) return;
    const sig = `${data.nodes.length}:${data.links.length}`;
    if (sig === dataSignatureRef.current) return;
    // Reload the data + fit
    const graph = buildGraphology(data);
    renderer.setGraph(graph);
    dataSignatureRef.current = sig;
    // Soft fit
    setTimeout(() => {
      try {
        renderer.getSigma().refresh();
      } catch {
        /* noop */
      }
    }, 60);
  }, [data]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setState({
      hoveredNodeId: hoveredId,
      selectedNodeId: null,
      focusModeEnabled: false,
    });
  }, [hoveredId]);

  useEffect(() => {
    return () => {
      try {
        rendererRef.current?.destroy();
      } catch {
        /* noop */
      }
      rendererRef.current = null;
    };
  }, []);

  // Esc closes
  useEffect(() => {
    if (!seed) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seed, onClose]);

  return (
    <aside
      aria-hidden={!seed}
      aria-label="الشبكة المحلية للمستند"
      className={`fixed inset-y-0 z-50 flex w-full max-w-[520px] flex-col border-r border-border bg-paper shadow-pop transition-transform duration-260 ease-out-expo ${
        seed ? "translate-x-0" : "-translate-x-full pointer-events-none"
      }`}
      style={{
        insetInlineStart: "auto",
        insetInlineEnd: "0",
        transform: seed ? "translateX(0)" : "translateX(-100%)",
        borderLeft: "none",
        borderRight: "1px solid var(--asa-border)",
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border bg-cream-soft/50 px-5 py-3">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-display text-[14px] font-bold text-ink-strong">
            الشبكة المحلية
          </span>
          <span className="truncate font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            لوحة المستند
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-paper px-2.5 text-[12px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:border-palm-200 hover:bg-palm-50 hover:text-palm-700 active:scale-[0.985]"
          aria-label="إغلاق الشبكة المحلية"
        >
          <span className="hidden sm:inline">إغلاق</span>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {seed && data && stats ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-cream-soft/30 px-5 py-2.5 text-[11.5px]">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-paper px-2 py-1 font-semibold text-ink-muted">
              <FileText className="h-3 w-3 text-tan-600" aria-hidden="true" />
              <span className="tnum">{stats.documents}</span>
              مستند
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-paper px-2 py-1 font-semibold text-ink-muted">
              <Layers className="h-3 w-3 text-tan-600" aria-hidden="true" />
              <span className="tnum">{stats.categories}</span>
              محور
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-paper px-2 py-1 font-semibold text-ink-muted">
              <Hash className="h-3 w-3 text-tan-600" aria-hidden="true" />
              <span className="tnum">{stats.tagBridges}</span>
              رابط
            </span>
            <span className="ms-auto text-[11px] text-ink-soft">
              جوار مباشر · بدون تشويش
            </span>
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              ref={containerRef}
              className="absolute inset-0"
            />
          </div>
          {seed.tags && seed.tags.length > 0 && (
            <div className="border-t border-border-soft bg-cream-soft/30 px-5 py-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <TagIcon
                  className="h-3.5 w-3.5 text-ink-soft"
                  aria-hidden="true"
                />
                <span className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  وسوم الجوار
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {seed.tags.slice(0, 8).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTagClick(t)}
                    className="inline-flex h-6 items-center rounded-md border border-border bg-paper px-2 text-[11px] font-semibold text-ink-muted transition-colors duration-180 ease-out-expo hover:border-palm-200 hover:bg-palm-50 hover:text-palm-700"
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-border bg-cream-soft/50 px-5 py-3">
            <button
              type="button"
              onClick={() => onOpenDocument(seed.documentId)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-palm bg-palm px-4 font-display text-[13.5px] font-semibold text-white shadow-palm transition-colors duration-180 ease-out-expo hover:bg-palm-600"
            >
              فتح المستند
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-ink-soft">
          <Network className="h-6 w-6 text-ink-soft" aria-hidden="true" />
          <p className="text-[13.5px]">اختر مستنداً لعرض شبكته المحلية.</p>
        </div>
      )}
    </aside>
  );
}
