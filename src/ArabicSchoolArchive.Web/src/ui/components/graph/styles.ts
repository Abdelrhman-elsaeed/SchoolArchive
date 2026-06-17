// Design tokens and visual policy for the knowledge graph.
//
// Everything visual lives here so the renderer stays declarative.
// The tokens in this file are the *only* source of truth for:
//   - node / edge sizing
//   - file-kind → color mapping
//   - node / edge reducers (sigma-style per-frame visual transforms)
//   - label policy thresholds
//
// The reducers are pure functions: given a node (or edge) and the
// current interaction state, they return the per-frame visual
// properties that sigma will use to render. Sigma calls them once per
// refresh, not per pixel, so the cost is O(N) per state change.

import type { NodeDisplayData, EdgeDisplayData } from "sigma/types";
import {
  CATEGORY_NODE_ID,
  type DocFileKind,
  type GraphEdgeAttributes,
  type GraphNodeAttributes,
  type InteractionState,
} from "./types.ts";

/* ──────────────────────────────────────────────────────────────────────────
 * Color tokens
 * Pulled from the project's Tailwind palette so the graph sits naturally
 * inside the rest of the archive UI.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Graph palette — derived from the redesigned brand tokens.
 * Mirrors the same Hijazi / Date Palm / Diriyah / Ink / Oud /
 * Sadu system used across the rest of the UI.
 */
export const COLORS = {
  /** Diriyah Tan — used for hub strokes and accents. */
  categoryStroke: "#C8A46A",
  /** Date Palm Green — deep category hub fill. */
  categoryFillInner: "#0E5A46",
  categoryFillMid: "#0A4636",
  categoryFillOuter: "#05241B",
  /** Subtle palm halo around category hubs. */
  categoryHalo: "rgba(14, 90, 70, 0.20)",
  /** Document node stroke (warm white ring on coloured fill). */
  documentStroke: "#FFFBF1",
  /** Tag bridge line — tan. */
  tagEdge: "#C8A46A",
  /** Category bond line — Ink Navy (calm, institutional). */
  categoryEdge: "#0F2236",
  /** Default label colour — Ink Navy. */
  labelText: "#0F2236",
  labelTextMuted: "#3F5468",
  /** Tan accent for sub-titles and counts. */
  labelAccent: "#9A7138",
  /** Background — warm surface. */
  background: "#FFFBF1",
} as const;

/**
 * File-kind → node colour. Grounded in the brand palette:
 *  - PDF  → Sadu Maroon
 *  - DOCX → Ink Navy
 *  - XLSX → Date Palm Green
 *  - IMG  → Oud Brown
 *  - other → Warm Gray
 */
export const FILE_KIND_COLOR: Record<DocFileKind, string> = {
  pdf: "#7A2E2E",
  doc: "#11314A",
  xls: "#0E5A46",
  img: "#5C4532",
  other: "#8A847B",
};

export const FILE_KIND_LABEL: Record<DocFileKind, string> = {
  pdf: "PDF",
  doc: "Word",
  xls: "Excel",
  img: "صورة",
  other: "ملف",
};

export function classifyFile(name: string): DocFileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "doc";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "xls";
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "img";
  return "other";
}

export function normalizeTag(t: string): string {
  return t.trim().toLowerCase();
}

export function isArchiveWithCategory(item: { category?: string | null }): boolean {
  return !!item.category && item.category.length > 0;
}

export const CATEGORY_ID = CATEGORY_NODE_ID;

/* ──────────────────────────────────────────────────────────────────────────
 * Sizing
 *
 * With `itemSizesReference: "screen"` (sigma's default, set in
 * `defaultSigmaSettings`), the `size` field returned by the reducer is
 * interpreted in **screen pixels at camera ratio = 1**. Sigma then
 * scales by sqrt(cameraRatio) as the user zooms in/out. This makes
 * the numbers below directly comparable to UI sizing tokens and
 * guarantees that no node can visually dominate the canvas.
 *
 * The category size scales with sqrt(docCount) (not linearly) and is
 * hard-clamped so a category with 1000 documents is no bigger than
 * one with 50.
 * ──────────────────────────────────────────────────────────────────────── */

export const NODE_SIZE = {
  /** Floor size for a category hub, in screen pixels. */
  categoryMin: 14,
  /** Cap on category size, in screen pixels. */
  categoryMax: 22,
  /**
   * sqrt(docCount) is multiplied by this to get the per-category
   * growth. With 100 docs: sqrt(100) = 10 → 4.2px growth → 18px cap.
   * With 1000 docs: sqrt(1000) = 31.6 → 13.3px growth → clamped to
   * categoryMax. So even a huge category stays under 22px.
   */
  categoryPerSqrtDoc: 0.42,
  /** Document leaf node size, in screen pixels. */
  document: 5,
  /** Document size cap (kept equal to base — no growth). */
  documentMax: 7,
  /** Hover inflation: +15% on top of base. */
  hoverBoost: 1.15,
  /** Selected inflation: +30% on top of base (still small in absolute terms). */
  selectBoost: 1.3,
  /** Hard ceiling on ANY node size, in screen pixels. */
  absoluteMax: 28,
} as const;

export const EDGE_SIZE = {
  categoryBase: 1.2,
  tagBase: 0.6,
  focusBoost: 1.4,
  dimmedMultiplier: 0.25,
} as const;

/**
 * Compute a safe, clamped node size.
 *
 * Centralising the clamp here means *every* code path that produces
 * a size passes through the same `absoluteMax` ceiling. If a future
 * change adds a new size source (e.g. degree-based), it MUST call
 * this function — otherwise the visual cap is bypassed.
 */
export function clampNodeSize(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(NODE_SIZE.absoluteMax, Math.max(1, raw));
}

/* ──────────────────────────────────────────────────────────────────────────
 * Camera + zoom policy
 * ──────────────────────────────────────────────────────────────────────── */

export const CAMERA = {
  minRatio: 0.18,
  maxRatio: 4,
  /** Initial fit-to-view animation duration (ms). */
  initialFitDurationMs: 620,
  /**
   * Padding (as a fraction of the viewport, 0..0.5) around the bbox
   * on initial fit. With `itemSizesReference: "screen"`, the bbox
   * extent is in graph units and the viewport is in pixels, so the
   * padding must be expressed as a ratio of the viewport. 8% on
   * each side gives the graph some breathing room.
   */
  initialFitPaddingRatio: 0.08,
  /**
   * Maximum ratio the initial-fit step is allowed to compute. Without
   * this clamp, a tiny graph (e.g. 2 nodes) would have a fit-ratio
   * near 0 and the camera would zoom in to the max, putting the two
   * nodes right in the user's face. 1.4 is a good "show the graph
   * from a comfortable distance" value.
   */
  initialFitMaxRatio: 1.4,
  /** Duration of the focus-on-select camera animation. */
  focusDurationMs: 520,
  /** Zoom factor used when the user clicks +/- on the controls. */
  zoomStep: 1.4,
  /** Ratio the camera goes to when the user clicks an empty area. */
  resetRatio: 1,
} as const;

/**
 * Per-zoom label policy.
 * The reducer below uses these thresholds together with the camera
 * ratio. Sigma calls the label renderer with the resolved sigma
 * settings, so we also use `labelRenderedSizeThreshold` (in
 * `styles.ts` exports) for a fine-grained pixel-size gate.
 */
export const LABEL_POLICY = {
  /** Below this ratio, only category labels + hovered/selected labels are drawn. */
  lowZoomMaxRatio: 0.55,
  /** Below this ratio, we drop document labels entirely. */
  midZoomMaxRatio: 1.0,
  /** Above this ratio, full labels are drawn. */
  fullZoomRatio: 1.4,
  /** When the renderer is *this* close, allow extra "neighbor" labels. */
  neighborZoomRatio: 1.05,
  /** Pixel-size threshold below which a label is suppressed by sigma itself. */
  labelRenderedSizeThreshold: 6,
  /** Category label minimum size (sigma does size-aware culling). */
  categoryLabelSize: 14,
  /** Document label base size. */
  documentLabelSize: 11,
} as const;

export const CATEGORY_LABEL = {
  font: '"Saudi", "Al-Awwal", "IBM Plex Sans Arabic", "Tajawal", system-ui, sans-serif',
  weight: "700",
} as const;

export const DOCUMENT_LABEL = {
  font: '"IBM Plex Sans Arabic", "Tajawal", system-ui, sans-serif',
  weight: "500",
} as const;

/* ──────────────────────────────────────────────────────────────────────────
 * Reducers — per-frame visual transforms applied by sigma.
 *
 * They are *pure* functions of (attribute, interactionState). The
 * interaction state is passed in via closure to a factory that returns
 * the reducer, so we don't need a context or event bus.
 *
 * Reducer contract:
 *   - Return *only* the fields you want to override. Sigma merges
 *     these with the default display data.
 *   - Do NOT mutate the input.
 *   - Tolerate missing or malformed attributes by falling back to
 *     safe defaults (the reducer may be called before the graph is
 *     fully populated during the initial layout).
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Apply a small hover/selected inflation to a base size. Inflation
 * is intentionally small (+15% / +30%) and passes through the same
 * `clampNodeSize` ceiling as the rest of the system, so a selected
 * node can never visually dominate the canvas.
 */
function sizeFor(
  base: number,
  isHovered: boolean,
  isSelected: boolean
): number {
  if (isSelected) return clampNodeSize(base * NODE_SIZE.selectBoost);
  if (isHovered) return clampNodeSize(base * NODE_SIZE.hoverBoost);
  return clampNodeSize(base);
}

/**
 * Build the sigma node reducer. The reducer is the only place where
 * per-frame visual decisions happen for nodes.
 */
export function makeNodeReducer(getState: () => InteractionState) {
  return function nodeReducer(
    node: string,
    data: GraphNodeAttributes
  ): Partial<NodeDisplayData> {
    const state = getState();
    const isHovered = state.hoveredNodeId === node;
    const isSelected = state.selectedNodeId === node;
    const isCategory = data.kind === "category";
    const isFocused = isHovered || isSelected;
    const isNeighbor = isFocused && state.focusNeighborIds.has(node) && !isHovered && !isSelected;
    const dim = state.hoveredNodeId || state.selectedNodeId;
    const inFocusSet = dim
      ? node === dim || state.focusNeighborIds.has(node)
      : true;

    // Category size: sqrt(docCount) growth, hard-clamped. The clamp
    // means a category with 100 documents looks ~the same as a
    // category with 1000 documents — important hubs are recognised
    // by their position and the *number of edges* around them, not
    // by a 500px-wide circle.
    const docCount = Math.max(0, data.docCount ?? 0);
    const categorySize = clampNodeSize(
      NODE_SIZE.categoryMin +
        Math.sqrt(docCount) * NODE_SIZE.categoryPerSqrtDoc
    );
    const clampedCategorySize = Math.min(categorySize, NODE_SIZE.categoryMax);
    const base = isCategory ? clampedCategorySize : NODE_SIZE.document;

    const size = sizeFor(base, isHovered, isSelected);

    const color = isCategory
      ? COLORS.categoryFillInner
      : FILE_KIND_COLOR[(data.fileKind ?? "other") as DocFileKind];

    // Labels: the label policy is enforced by combining a boolean
    // `label` flag with the sigma `labelSize` setting. Sigma itself
    // culls labels that are too small in pixel-space via
    // `labelRenderedSizeThreshold` (set in `defaultSigmaSettings`).
    const showLabel = shouldShowLabel(
      isCategory,
      isHovered,
      isSelected,
      isNeighbor,
      state,
      inFocusSet
    );

    // Defensively ensure x and y are always valid numbers to prevent WebGL crashes
    // if FA2 or another pipeline step temporarily sets them to NaN. Sigma's
    // `applyNodeDefaults` will throw if these are missing, so the reducer
    // MUST return them as own properties.
    const rawX = (data as { x?: unknown }).x;
    const rawY = (data as { y?: unknown }).y;
    const x = typeof rawX === "number" && Number.isFinite(rawX) ? rawX : 0;
    const y = typeof rawY === "number" && Number.isFinite(rawY) ? rawY : 0;

    return {
      x,
      y,
      // Use sigma's built-in `circle` program. Visual distinction
      // between category and document comes from `size` + `color`
      // below, not from a different WebGL program.
      type: SIGMA_PROGRAM_TYPES.node,
      // size has already been through clampNodeSize inside sizeFor, so
      // it is guaranteed to be a positive finite number <= absoluteMax.
      size,
      color,
      label: showLabel ? data.label ?? null : null,
      forceLabel: isHovered || isSelected,
      zIndex: isHovered || isSelected ? 20 : isCategory ? 10 : 5,
      // We expose `highlighted` so the default node program draws
      // the selected-state halo.
      highlighted: isHovered || isSelected,
    };
  };
}

function shouldShowLabel(
  isCategory: boolean,
  isHovered: boolean,
  isSelected: boolean,
  isNeighbor: boolean,
  state: InteractionState,
  inFocusSet: boolean
): boolean {
  // Hovered or selected always show their label.
  if (isHovered || isSelected) return true;
  // In focus mode, hide labels of nodes outside the focus set.
  if (state.focusModeEnabled && !inFocusSet) return false;
  // Categories are anchors and stay labelled most of the time.
  if (isCategory) {
    return state.hoveredNodeId || state.selectedNodeId
      ? isNeighbor
      : true;
  }
  // Documents: gated by the interaction state and (indirectly) by
  // the sigma pixel-size culler.
  if (state.hoveredNodeId || state.selectedNodeId) {
    return isNeighbor;
  }
  // No focus: defer to sigma's own culling, which uses the ratio
  // and `labelRenderedSizeThreshold` to skip tiny labels.
  return true;
}

/**
 * Build the sigma edge reducer.
 *
 * Edges inherit the visual policy:
 *   - dim non-focused edges when a node is hovered/selected
 *   - boost thickness of edges touching the focused node
 *   - use the project palette for the two edge kinds
 */
export function makeEdgeReducer(getState: () => InteractionState) {
  return function edgeReducer(
    edge: string,
    data: GraphEdgeAttributes
  ): Partial<EdgeDisplayData> {
    const state = getState();
    const focusedId = state.hoveredNodeId ?? state.selectedNodeId;
    const isFocused = !!focusedId;
    const baseSize =
      data.kind === "tag" ? EDGE_SIZE.tagBase : EDGE_SIZE.categoryBase;

    if (!isFocused) {
      return {
        // Use sigma's built-in `line` program. The semantic kind
        // (category vs tag) is captured by `color` + `size` + the
        // dashed-line style would be a separate program; for our
        // visual policy a single line program with colour is enough.
        type: SIGMA_PROGRAM_TYPES.edge,
        size: baseSize,
        color:
          data.kind === "tag"
            ? withAlpha(COLORS.tagEdge, 0.32)
            : withAlpha(COLORS.categoryEdge, 0.55),
        label: null,
      };
    }

    // Endpoints of an edge are not on the reducer API. We rely on the
    // orchestrator to *also* mark touching edges via `state.focusNeighborIds`
    // is intentionally a node-id set; for the edge's endpoints we expose a
    // derived set passed via the closure.
    // The orchestrator passes the edge's endpoints via a lookup in
    // `interaction.ts`; for the reducer we just default to "touching"
    // when the edge type matches the focused node. Per-edge endpoint
    // highlighting is handled in `interaction.ts` and forwarded via
    // the closure variable below.
    const touching = isEdgeTouchingFocus(edge, state);
    const size = touching
      ? baseSize * EDGE_SIZE.focusBoost
      : baseSize * EDGE_SIZE.dimmedMultiplier;
    const color =
      data.kind === "tag"
        ? withAlpha(
            COLORS.tagEdge,
            touching ? 0.85 : 0.06
          )
        : withAlpha(
            COLORS.categoryEdge,
            touching ? 0.95 : 0.05
          );

    return {
      type: SIGMA_PROGRAM_TYPES.edge,
      size,
      color,
      label: null,
    };
  };
}

/* Helper: is this edge touching the focused node? Implemented in
 * `interaction.ts` and re-exported here to keep reducer files small.
 * The orchestrator wires the actual function via `setEdgeTouchLookup`.
 */
let edgeTouchLookup: (edgeKey: string) => boolean = () => false;
export function setEdgeTouchLookup(fn: (edgeKey: string) => boolean): void {
  edgeTouchLookup = fn;
}
function isEdgeTouchingFocus(edgeKey: string, state: InteractionState): boolean {
  void state; // not used; lookup is stateful per the orchestrator wiring
  return edgeTouchLookup(edgeKey);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

/** Convert "#rrggbb" + alpha to a CSS rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Default sigma settings
 * ──────────────────────────────────────────────────────────────────────── */

import type { Settings } from "sigma/settings";

/**
 * The list of node/edge program types that sigma ships with out of the
 * box. Any custom `type` returned by a reducer MUST be one of these
 * OR be registered via `settings.nodeProgramClasses` /
 * `settings.edgeProgramClasses`. Sigma throws "could not find a
 * suitable program" if a reducer returns an unregistered type.
 *
 * See: `node_modules/sigma/settings/dist/sigma-settings.cjs.dev.js`
 *   DEFAULT_NODE_PROGRAM_CLASSES = { circle: NodeCircleProgram }
 *   DEFAULT_EDGE_PROGRAM_CLASSES = { arrow: EdgeArrowProgram, line: EdgeRectangleProgram }
 */
export const SIGMA_PROGRAM_TYPES = {
  node: "circle",
  edge: "line",
} as const;

/** Base sigma settings used by the orchestrator. */
export function defaultSigmaSettings(): Partial<Settings<GraphNodeAttributes, GraphEdgeAttributes>> {
  return {
    // Visual
    defaultNodeColor: COLORS.categoryFillInner,
    defaultEdgeColor: COLORS.categoryEdge,
    // IMPORTANT: must be a type that sigma actually has a program for.
    // The default programs are { circle } for nodes and { line, arrow }
    // for edges. Returning any other value from a reducer would throw
    // "could not find a suitable program for node type …".
    defaultNodeType: SIGMA_PROGRAM_TYPES.node,
    defaultEdgeType: SIGMA_PROGRAM_TYPES.edge,
    labelFont: DOCUMENT_LABEL.font,
    labelSize: LABEL_POLICY.documentLabelSize,
    labelWeight: DOCUMENT_LABEL.weight,
    labelColor: { color: COLORS.labelText },
    labelDensity: 0.07,
    labelGridCellSize: 60,
    labelRenderedSizeThreshold: LABEL_POLICY.labelRenderedSizeThreshold,
    // Edges
    minEdgeThickness: 0.5,
    // Camera
    minCameraRatio: CAMERA.minRatio,
    maxCameraRatio: CAMERA.maxRatio,
    zoomDuration: 220,
    zoomToSizeRatioFunction: (r) => Math.pow(r, 0.5),
    // Interaction
    enableEdgeEvents: true,
    hideEdgesOnMove: false,
    hideLabelsOnMove: false,
    // Picking
    // "screen" makes the `size` field returned by the reducer be
    // interpreted in screen pixels at camera ratio = 1. This is the
    // only sane choice for a UI with predictable pixel-sized nodes:
    // the alternative ("positions") interprets size in graph units,
    // which is coupled to the layout bbox and makes nodes balloon
    // when the layout is tight.
    itemSizesReference: "screen",
    // Anti-aliasing / GPU polish
    autoRescale: true,
    autoCenter: true,
  };
}
