// Sigma renderer — owns the Sigma instance and exposes a small,
// imperative API to the orchestrator component.
//
// Why an imperative façade?
// -------------------------
// Sigma is a stateful object with a long-lived WebGL context, a
// graphology instance, and a camera. Wrapping it in a class keeps
// the React component decoupled from the sigma API surface and gives
// us a single, well-defined place to:
//
//   - construct / destroy the renderer
//   - swap the graph in response to data changes
//   - update the interaction state (hovered / selected / focus)
//   - drive the camera (fit-to-view, animated zoom, etc.)
//   - hook / unhook event listeners
//
// The orchestrator (`GraphView.tsx`) holds a `ref` to the renderer
// and calls its methods. The orchestrator does NOT touch sigma
// directly.

import Sigma from "sigma";
import Graph from "graphology";
import type {
  GraphEdgeAttributes,
  GraphNodeAttributes,
  InteractionState,
  RuntimeEdgeAttributes,
  RuntimeNodeAttributes,
} from "./types.ts";
import { emptyInteractionState } from "./types.ts";
import {
  CAMERA,
  defaultSigmaSettings,
  makeEdgeReducer,
  makeNodeReducer,
  setEdgeTouchLookup,
} from "./styles.ts";
import { computeNeighborSet, computeTouchingEdgeSet } from "./interaction.ts";

export interface RendererOptions {
  container: HTMLElement;
  initialState?: InteractionState;
}

/**
 * Owns the Sigma instance and its associated graphology graph.
 *
 * The renderer is fully self-contained: callers pass it a container
 * element and update its state via `setState` / `setGraph` / etc.
 * Cleanup is handled by `destroy()`.
 */
export class GraphRenderer {
  private sigma: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>;
  private graphInstance: Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes>;
  private state: InteractionState;
  private getState: () => InteractionState;
  private disposed = false;
  /** Cached lookup for the edge reducer: is this edge touching the focus? */
  private touchingEdges: Set<string> = new Set();
  /** The most recently passed *seed* data, used to know when to refit. */
  private currentGraphKey: string = "";

  constructor(opts: RendererOptions) {
    this.state = opts.initialState ?? emptyInteractionState();
    this.getState = (): InteractionState => this.state;

    // We start with an empty graph; the orchestrator calls
    // `setGraph(...)` once it has built one. This keeps the sigma
    // instance stable across data changes.
    this.graphInstance = new Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes>({
      type: "undirected",
      multi: false,
      allowSelfLoops: false,
    });

    const settings = defaultSigmaSettings();
    this.sigma = new Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>(
      this.graphInstance,
      opts.container,
      {
        ...settings,
        nodeReducer: makeNodeReducer(this.getState),
        edgeReducer: makeEdgeReducer(this.getState),
      }
    );

    // Wire the edge-touch lookup that the edge reducer uses.
    setEdgeTouchLookup((edgeKey) => this.touchingEdges.has(edgeKey));

    // Apply camera bounds.
    const camera = this.sigma.getCamera();
    camera.minRatio = CAMERA.minRatio;
    camera.maxRatio = CAMERA.maxRatio;

    // Self-test: run our reducers once on a synthetic node/edge and
    // verify the returned `type` is one sigma has a program for.
    // Sigma throws "could not find a suitable program for node type …"
    // on first render if this invariant is broken; checking here turns
    // that into a clear developer error at startup.
    assertReducerTypesAreRegistered(
      this.sigma,
      makeNodeReducer(this.getState),
      makeEdgeReducer(this.getState)
    );
  }

  /**
   * Replace the graph with a new one. The sigma renderer is
   * preserved; only the data swap.
   */
  setGraph(graph: Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes>): void {
    if (this.disposed) return;
    this.graphInstance = graph;
    this.sigma.setGraph(graph);
    // Re-derive neighbor / touching sets against the new graph.
    this.recomputeFocus();
    this.sigma.refresh();
  }

  /**
   * Quick signature for the currently loaded graph; used by the
   * orchestrator to detect "data identity" changes (and therefore
   * re-fit the camera).
   */
  get graphKey(): string {
    return this.currentGraphKey;
  }
  setGraphKey(key: string): void {
    this.currentGraphKey = key;
  }

  /**
   * Update the interaction state. Recomputes neighbor/touching sets
   * if the focused id changed, then asks sigma to refresh.
   */
  setState(patch: Partial<InteractionState>): void {
    if (this.disposed) return;
    const prev = this.state;
    const next: InteractionState = { ...prev, ...patch };
    if (
      next.hoveredNodeId !== prev.hoveredNodeId ||
      next.selectedNodeId !== prev.selectedNodeId
    ) {
      const focused = next.hoveredNodeId ?? next.selectedNodeId;
      if (focused) {
        next.focusNeighborIds = computeNeighborSet(
          this.graphInstance,
          focused
        );
        this.touchingEdges = computeTouchingEdgeSet(
          this.graphInstance,
          focused,
          next.focusNeighborIds
        );
      } else {
        next.focusNeighborIds = new Set();
        this.touchingEdges = new Set();
      }
    } else {
      next.focusNeighborIds = prev.focusNeighborIds;
    }
    this.state = next;
    this.sigma.refresh();
  }

  /** Recompute the focus sets from scratch (e.g. after a graph swap). */
  private recomputeFocus(): void {
    const focused = this.state.hoveredNodeId ?? this.state.selectedNodeId;
    if (focused) {
      this.state.focusNeighborIds = computeNeighborSet(
        this.graphInstance,
        focused
      );
      this.touchingEdges = computeTouchingEdgeSet(
        this.graphInstance,
        focused,
        this.state.focusNeighborIds
      );
    } else {
      this.state.focusNeighborIds = new Set();
      this.touchingEdges = new Set();
    }
  }

  /**
   * Animate the camera to fit all the nodes in the viewport.
   * Idempotent; safe to call multiple times.
   *
   * Defensive: the bbox is sanity-checked. If it is empty, dominated
   * by a single outlier node, or otherwise implausible, we fall back
   * to a safe "1.0 ratio, centroid" view rather than cramming the
   * graph into the corner. This is the most important guardrail for
   * preventing the "giant dark-blue node swallows the canvas" bug.
   */
  fitToView(durationMs: number = CAMERA.initialFitDurationMs): void {
    if (this.disposed) return;
    if (this.graphInstance.order === 0) return;

    // Calculate bbox manually from the graph instance to avoid relying
    // on Sigma's WebGL deferred bbox during initial/sync renders.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.graphInstance.forEachNode((_, attr) => {
      const px = attr.x as number;
      const py = attr.y as number;
      if (typeof px === "number" && typeof py === "number" && !Number.isNaN(px) && !Number.isNaN(py)) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    });

    if (minX === Infinity) {
      // Safe fallback if positions are unassigned
      this.applyCameraSafe({ x: 0, y: 0, ratio: CAMERA.resetRatio }, durationMs);
      return;
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Sanity check: if the bbox is implausibly small (collapsed
    // layout) or implausibly large (single outlier node off in
    // space), use a safe default. The threshold is "graph units per
    // typical node" — anything under ~0.1 means the layout has not
    // really happened yet, anything over 1e6 means a node drifted
    // away to infinity.
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      this.applyCameraSafe({ x: cx, y: cy, ratio: CAMERA.resetRatio }, durationMs);
      return;
    }
    if (w < 0.1 && h < 0.1) {
      this.applyCameraSafe({ x: cx, y: cy, ratio: CAMERA.resetRatio }, durationMs);
      return;
    }
    if (w > 1e6 || h > 1e6) {
      // eslint-disable-next-line no-console
      console.warn("[GraphRenderer] bbox too large, falling back to safe camera", { w, h });
      this.applyCameraSafe({ x: cx, y: cy, ratio: CAMERA.resetRatio }, durationMs);
      return;
    }

    const dims = this.sigma.getDimensions();
    // Guard against width/height = 0 on first mount
    const width = dims.width > 0 ? dims.width : 500;
    const height = dims.height > 0 ? dims.height : 500;

    const padX = Math.max(0, width * CAMERA.initialFitPaddingRatio);
    const padY = Math.max(0, height * CAMERA.initialFitPaddingRatio);
    const innerW = Math.max(1, width - 2 * padX);
    const innerH = Math.max(1, height - 2 * padY);

    const ratioX = w / innerW;
    const ratioY = h / innerH;
    let ratio = Math.max(ratioX, ratioY, CAMERA.minRatio);
    // Clamp to a sane upper bound for the initial fit, regardless of
    // CAMERA.maxRatio, so a small graph doesn't zoom in absurdly far.
    ratio = Math.min(
      Math.max(ratio, CAMERA.minRatio),
      Math.min(CAMERA.maxRatio, CAMERA.initialFitMaxRatio)
    );

    if (w === 0 && h === 0) {
      // Degenerate graph (1 node)
      ratio = CAMERA.resetRatio;
    }

    this.applyCameraSafe({ x: cx, y: cy, ratio }, durationMs);
  }

  /**
   * Apply a camera state, with sanitisation. A negative or NaN value
   * would put the camera at infinity, so we always go through this
   * helper.
   */
  private applyCameraSafe(
    state: { x: number; y: number; ratio: number },
    durationMs: number
  ): void {
    if (this.disposed) return;
    const camera = this.sigma.getCamera();
    const safeState = {
      x: Number.isFinite(state.x) ? state.x : 0,
      y: Number.isFinite(state.y) ? state.y : 0,
      ratio: Number.isFinite(state.ratio) && state.ratio > 0
        ? state.ratio
        : CAMERA.resetRatio,
    };
    if (durationMs > 0) {
      void camera.animate(safeState, {
        duration: durationMs,
        easing: "quadraticInOut",
      });
    } else {
      camera.setState(safeState);
    }
  }

  /**
   * Animate the camera to centre on a specific node.
   */
  focusOnNode(nodeId: string, durationMs: number = CAMERA.focusDurationMs): void {
    if (this.disposed) return;
    if (!this.graphInstance.hasNode(nodeId)) return;
    const nodeAttrs = this.graphInstance.getNodeAttributes(nodeId);
    const x = (nodeAttrs as unknown as { x?: number }).x;
    const y = (nodeAttrs as unknown as { y?: number }).y;
    if (typeof x !== "number" || typeof y !== "number") return;
    const camera = this.sigma.getCamera();
    const targetRatio = Math.max(
      camera.getState().ratio,
      // Make sure we're not too far in/out for the focused node.
      CAMERA.minRatio * 4
    );
    void camera.animate(
      { x, y, ratio: targetRatio },
      { duration: durationMs, easing: "quadraticInOut" }
    );
  }

  /** Zoom controls. */
  zoomIn(): void {
    if (this.disposed) return;
    const camera = this.sigma.getCamera();
    const ratio = camera.getState().ratio / CAMERA.zoomStep;
    const bounded = camera.getBoundedRatio(ratio);
    void camera.animate(
      { ratio: bounded },
      { duration: 220, easing: "quadraticOut" }
    );
  }
  zoomOut(): void {
    if (this.disposed) return;
    const camera = this.sigma.getCamera();
    const ratio = camera.getState().ratio * CAMERA.zoomStep;
    const bounded = camera.getBoundedRatio(ratio);
    void camera.animate(
      { ratio: bounded },
      { duration: 220, easing: "quadraticOut" }
    );
  }
  recenter(): void {
    this.fitToView();
  }

  /** Current camera ratio (used by the on-screen indicator). */
  getZoom(): number {
    if (this.disposed) return 1;
    return this.sigma.getCamera().getState().ratio;
  }

  /** Access the underlying sigma instance (escape hatch). */
  getSigma(): Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
    return this.sigma;
  }

  /** Access the underlying graphology instance. */
  getGraph(): Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
    return this.graphInstance;
  }

  /** Current interaction state. */
  getInteractionState(): InteractionState {
    return this.state;
  }

  /** True if the renderer is still usable. */
  get alive(): boolean {
    return !this.disposed;
  }

  /** Tear down. Idempotent. */
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.sigma.kill();
    } catch {
      /* noop */
    }
    setEdgeTouchLookup(() => false);
  }
}

// Re-export the types so consumers don't need a second import.
export type { GraphNodeAttributes, GraphEdgeAttributes };

/* ──────────────────────────────────────────────────────────────────────────
 * Startup self-test
 *
 * Sigma throws "could not find a suitable program for node type …"
 * the first time the renderer asks the program registry for a type
 * that wasn't registered. That happens *during* the first render —
 * too late for a clean error. We invoke our reducers on synthetic
 * inputs and assert their returned `type` is a registered program,
 * so a future regression produces a clear developer-visible error at
 * module load time.
 * ──────────────────────────────────────────────────────────────────────── */

function assertReducerTypesAreRegistered(
  sigma: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>,
  nodeReducer: (
    node: string,
    data: RuntimeNodeAttributes
  ) => Partial<{ type?: string }>,
  edgeReducer: (
    edge: string,
    data: RuntimeEdgeAttributes
  ) => Partial<{ type?: string }>
): void {
  try {
    // Inspect the registered programs. Sigma doesn't expose them
    // directly, so we read them off the settings.
    const settings = sigma.getSettings();
    const nodePrograms = settings.nodeProgramClasses ?? {};
    const edgePrograms = settings.edgeProgramClasses ?? {};

    // Synthetic node: category.
    const catAttrs: RuntimeNodeAttributes = {
      label: "cat",
      kind: "category",
      docCount: 1,
      x: 0,
      y: 0,
    };
    const catOut = nodeReducer("cat::test", catAttrs);
    const catType = typeof catOut.type === "string" ? catOut.type : "unknown";
    if (!(catType in nodePrograms)) {
      throw new Error(
        `[Graph] nodeReducer returned unregistered node type "${catType}". ` +
          `Registered types: [${Object.keys(nodePrograms).join(", ")}]. ` +
          `Either change the reducer to return a registered type (e.g. "circle") ` +
          `or register a custom program via settings.nodeProgramClasses.`
      );
    }

    // Synthetic node: document.
    const docAttrs: RuntimeNodeAttributes = {
      label: "doc",
      kind: "document",
      x: 1,
      y: 1,
    };
    const docOut = nodeReducer("doc::test", docAttrs);
    const docType = typeof docOut.type === "string" ? docOut.type : "unknown";
    if (!(docType in nodePrograms)) {
      throw new Error(
        `[Graph] nodeReducer returned unregistered node type "${docType}". ` +
          `Registered types: [${Object.keys(nodePrograms).join(", ")}].`
      );
    }

    // Synthetic edge: category.
    const catEdge: RuntimeEdgeAttributes = { kind: "category", weight: 1 };
    const catEdgeOut = edgeReducer("edge::c", catEdge);
    const catEdgeType =
      typeof catEdgeOut.type === "string" ? catEdgeOut.type : "unknown";
    if (!(catEdgeType in edgePrograms)) {
      throw new Error(
        `[Graph] edgeReducer returned unregistered edge type "${catEdgeType}". ` +
          `Registered types: [${Object.keys(edgePrograms).join(", ")}]. ` +
          `Either change the reducer to return a registered type (e.g. "line") ` +
          `or register a custom program via settings.edgeProgramClasses.`
      );
    }

    // Synthetic edge: tag.
    const tagEdge: RuntimeEdgeAttributes = { kind: "tag", weight: 1 };
    const tagEdgeOut = edgeReducer("edge::t", tagEdge);
    const tagEdgeType =
      typeof tagEdgeOut.type === "string" ? tagEdgeOut.type : "unknown";
    if (!(tagEdgeType in edgePrograms)) {
      throw new Error(
        `[Graph] edgeReducer returned unregistered edge type "${tagEdgeType}". ` +
          `Registered types: [${Object.keys(edgePrograms).join(", ")}].`
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    throw err;
  }
}
