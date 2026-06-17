// Layout engine — ForceAtlas2.
//
// Why ForceAtlas2?
// ----------------
// ForceAtlas2 (Jacomy et al., 2014, the Gephi algorithm) is the
// de-facto standard for "Obsidian-like" knowledge graph layouts. It
// produces visibly more stable, well-clustered, and aesthetically
// pleasing layouts than d3-force's spring-electric system for the
// kind of mid-sized graphs we render (≤ ~500 nodes).
//
// Why a worker (where possible)?
// ------------------------------
// FA2 has O(N²) cost per iteration. Running it on the main thread
// freezes the UI for the duration of the layout. The webworker build
// of `graphology-layout-forceatlas2` ships the algorithm pre-bundled
// for use with `new Worker(...)`. The orchestrator runs the layout
// off-thread when the browser supports it, and falls back to a
// synchronous, iteration-bounded run otherwise.
//
// The supervisor loops indefinitely until `stop()` is called. We
// bound it to a wall-clock budget (maxIterations * ~12ms per tick
// estimate) and stop it once the budget is reached.
//
// Trade-off: the worker is a black box. We cannot read intermediate
// states, so the layout appears to "jump" from the seed positions to
// the converged positions at the end. This is actually *better* for
// UX than a constantly-jiggling d3 simulation, because the camera
// stays still and the user sees a clean, deliberate animation.

import forceAtlas2, {
  type ForceAtlas2Settings,
} from "graphology-layout-forceatlas2";
import Graph from "graphology";
import type {
  GraphData,
  GraphNode as BuiltGraphNode,
  RuntimeEdgeAttributes,
  RuntimeNodeAttributes,
} from "./types.ts";

type NodeAttrs = RuntimeNodeAttributes;
type EdgeAttrs = RuntimeEdgeAttributes;

/* ──────────────────────────────────────────────────────────────────────────
 * Settings
 * ──────────────────────────────────────────────────────────────────────── */

const BASE_FA2_SETTINGS: ForceAtlas2Settings = {
  linLogMode: false,
  outboundAttractionDistribution: false,
  adjustSizes: false,
  edgeWeightInfluence: 0.6,
  scalingRatio: 18,
  strongGravityMode: true,
  gravity: 1.2,
  slowDown: 8,
  barnesHutOptimize: true,
  barnesHutTheta: 0.5,
};

/**
 * Per-graph size tuning. Bigger graphs need stronger gravity and a
 * slightly higher scaling ratio to look balanced.
 */
function settingsFor(nodeCount: number): ForceAtlas2Settings {
  if (nodeCount === 0) return BASE_FA2_SETTINGS;
  const scale = Math.sqrt(nodeCount / 60);
  return {
    ...BASE_FA2_SETTINGS,
    scalingRatio: Math.min(60, 18 * Math.max(1, scale)),
    gravity: Math.max(0.6, 1.2 / Math.max(1, Math.sqrt(scale))),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Build a graphology graph from the raw dataset.
 *
 * The buildGraph step already places categories on a circle and
 * documents around their category hub. We carry those positions into
 * the graphology instance so FA2 starts from a *meaningful* seed
 * rather than a random scattering.
 * ──────────────────────────────────────────────────────────────────────── */

function readSeed(n: BuiltGraphNode): { x?: number; y?: number } {
  const s = n as BuiltGraphNode & { x?: number; y?: number };
  return { x: s.x, y: s.y };
}

function isFinitePosition(x: unknown, y: unknown): boolean {
  return typeof x === "number" && Number.isFinite(x) &&
         typeof y === "number" && Number.isFinite(y);
}

function sanitizeNodeAttributes(id: string, n: BuiltGraphNode, seed: { x?: number; y?: number }): NodeAttrs | null {
  if (!id || typeof id !== "string") return null;
  
  const x = isFinitePosition(seed.x, seed.y) ? seed.x! : (Math.random() - 0.5) * 100;
  const y = isFinitePosition(seed.x, seed.y) ? seed.y! : (Math.random() - 0.5) * 100;
  
  return {
    label: typeof n.label === "string" ? n.label : id,
    kind: n.kind === "category" ? "category" : "document",
    docCount: typeof n.docCount === "number" ? n.docCount : 0,
    fileKind: n.fileKind || "other",
    documentId: n.documentId || "",
    category: n.category || "",
    tags: Array.isArray(n.tags) ? n.tags : [],
    x,
    y,
  };
}

function dropInvalidNodesWithDevWarning(graph: Graph<NodeAttrs, EdgeAttrs>): void {
  const toDrop: string[] = [];
  graph.forEachNode((node, attr) => {
    if (!isFinitePosition(attr.x, attr.y)) {
      // eslint-disable-next-line no-console
      console.warn(`[Graph] Dropping node ${node} due to invalid position:`, attr);
      toDrop.push(node);
    }
  });
  toDrop.forEach(n => graph.dropNode(n));
}

export function buildGraphology(data: GraphData): Graph<NodeAttrs, EdgeAttrs> {
  const graph = new Graph<NodeAttrs, EdgeAttrs>({
    type: "undirected",
    multi: false,
    allowSelfLoops: false,
  });
  
  for (const n of data.nodes) {
    const seed = readSeed(n);
    const attrs = sanitizeNodeAttributes(n.id, n, seed);
    if (!attrs) {
      // eslint-disable-next-line no-console
      console.warn(`[Graph] Skipping invalid node without ID:`, n);
      continue;
    }
    try {
      if (!graph.hasNode(n.id)) {
        graph.addNode(n.id, attrs);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Graph] Failed to add node ${n.id}:`, err);
    }
  }
  for (const l of data.links) {
    if (!graph.hasNode(l.source) || !graph.hasNode(l.target)) continue;
    if (graph.hasEdge(l.source, l.target)) continue;
    
    const weight = typeof l.weight === "number" && Number.isFinite(l.weight) ? l.weight : 1;
    
    try {
      graph.addEdgeWithKey(
        `${l.source}::${l.target}::${Math.random().toString(36).slice(2, 8)}`,
        l.source,
        l.target,
        { kind: l.kind, weight, sharedTag: l.sharedTag }
      );
    } catch {
      // Defensive: skip any edge that the graphology instance rejects.
    }
  }
  
  dropInvalidNodesWithDevWarning(graph);
  
  return graph;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Synchronous FA2
 *
 * Used as a fallback when the worker entry is unavailable (SSR,
 * tests). Iterations are bounded so a giant graph cannot block the
 * main thread indefinitely.
 * ──────────────────────────────────────────────────────────────────────── */

export interface LayoutResult {
  graph: Graph<NodeAttrs, EdgeAttrs>;
  iterations: number;
}

/** Run FA2 in the current thread. */
export function runLayoutSync(
  graph: Graph<NodeAttrs, EdgeAttrs>,
  iterations = 200
): LayoutResult {
  if (graph.order === 0) return { graph, iterations: 0 };
  const settings = settingsFor(graph.order);
  try {
    forceAtlas2.assign(graph, {
      settings,
      getEdgeWeight: "weight",
      iterations,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Sync layout failed", err);
    // Defensive: if the layout fails, the seed positions are still
    // valid and sigma will render them.
  }
  return { graph, iterations };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Worker-mode FA2
 *
 * The supervisor loops indefinitely until `stop()` is called. We
 * bound it to a wall-clock budget: the supervisor is stopped after
 * `maxIterations * iterationMsEstimate` milliseconds, which is a
 * reasonable upper bound for medium-sized graphs.
 * ──────────────────────────────────────────────────────────────────────── */

export interface AsyncLayoutHandle {
  /** The graph with positions populated. */
  graph: Graph<NodeAttrs, EdgeAttrs>;
  /** Awaitable that resolves when the layout is done. */
  done: Promise<LayoutResult>;
  /** Stop the worker immediately. Idempotent. */
  stop: () => void;
}

interface SupervisorLike {
  start(): void;
  stop(): void;
  kill(): void;
  isRunning(): boolean;
}

interface SupervisorCtor {
  new (
    graph: Graph<NodeAttrs, EdgeAttrs>,
    params: { settings: ForceAtlas2Settings; getEdgeWeight?: "weight" }
  ): SupervisorLike;
}

let supervisorCtorPromise: Promise<SupervisorCtor> | null = null;

function loadSupervisorCtor(): Promise<SupervisorCtor> {
  if (!supervisorCtorPromise) {
    supervisorCtorPromise = import("graphology-layout-forceatlas2/worker").then(
      (m: { default?: SupervisorCtor }) =>
        (m.default ?? (m as unknown as SupervisorCtor))
    );
  }
  return supervisorCtorPromise;
}

/** Heuristic: are workers usable in this environment? */
function workersAvailable(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

/** Start an FA2 layout run in a Web Worker. */
export async function runLayoutAsync(
  graph: Graph<NodeAttrs, EdgeAttrs>,
  maxIterations = 240
): Promise<AsyncLayoutHandle> {
  if (graph.order === 0) {
    return {
      graph,
      done: Promise.resolve({ graph, iterations: 0 }),
      stop: () => undefined,
    };
  }

  if (!workersAvailable()) {
    const result = runLayoutSync(graph, maxIterations);
    return {
      graph,
      done: Promise.resolve(result),
      stop: () => undefined,
    };
  }

  let Supervisor: SupervisorCtor;
  try {
    Supervisor = await loadSupervisorCtor();
  } catch {
    const result = runLayoutSync(graph, maxIterations);
    return {
      graph,
      done: Promise.resolve(result),
      stop: () => undefined,
    };
  }

  const settings = settingsFor(graph.order);
  let instance: SupervisorLike;
  try {
    instance = new Supervisor(graph, {
      settings,
      getEdgeWeight: "weight",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Worker supervisor failed to initialize", err);
    const result = runLayoutSync(graph, maxIterations);
    return {
      graph,
      done: Promise.resolve(result),
      stop: () => undefined,
    };
  }

  // Wall-clock budget. ~12ms per iteration is a safe upper bound for
  // medium graphs; the supervisor only runs as long as we let it.
  const iterationMsEstimate = 12;
  const budgetMs = Math.max(1500, maxIterations * iterationMsEstimate);

  let stopped = false;
  const safeStop = (): void => {
    if (stopped) return;
    stopped = true;
    try {
      if (instance.isRunning && instance.isRunning()) {
        instance.stop();
      }
      if (instance.kill) {
        instance.kill();
      } else {
        instance.stop();
      }
    } catch {
      /* noop */
    }
  };

  const done = new Promise<LayoutResult>((resolve) => {
    const timer = (
      typeof window !== "undefined" ? window.setTimeout : setTimeout
    )(() => {
      safeStop();
      resolve({ graph, iterations: maxIterations });
    }, budgetMs);
    void timer;
  });
  
  try {
    instance.start();
  } catch (err) {
    safeStop();
    // eslint-disable-next-line no-console
    console.warn("Worker supervisor failed to start", err);
    const result = runLayoutSync(graph, maxIterations);
    return {
      graph,
      done: Promise.resolve(result),
      stop: () => undefined,
    };
  }

  return {
    graph,
    done,
    stop: () => {
      safeStop();
    },
  };
}

/**
 * Marker so the bundler (Vite) can discover the webworker entry
 * point at build time. The supervisor imports it via `import()`;
 * keeping a static reference here makes the asset graph explicit.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _WORKER_REFERENCE = new URL(
  "graphology-layout-forceatlas2/webworker.js",
  import.meta.url
).toString();
void _WORKER_REFERENCE;
