// Central type definitions for the knowledge graph module.
//
// This module is the *only* place where the graph data model and
// interaction state are described. Other modules import from here so
// that the rest of the application never sees a Sigma-specific shape.

import type { Attributes } from "graphology-types";

export type DocFileKind = "pdf" | "doc" | "xls" | "img" | "other";

export type GraphNodeKind = "category" | "document";

export type GraphLinkKind = "category" | "tag";

/**
 * Node attributes stored on the graphology instance.
 * These attributes are immutable for the lifetime of the graph; visual
 * state (hover, dim, etc.) is layered on top by `nodeReducer` in `styles.ts`.
 */
export interface GraphNodeAttributes extends Attributes {
  /** Display label, used for both the on-node label and the legend. */
  label: string;
  /** Node kind. Categories are hubs; documents are leaves. */
  kind: GraphNodeKind;
  /** Number of documents in this category (categories only). */
  docCount?: number;
  /** File classification (documents only). */
  fileKind?: DocFileKind;
  /** Archive document id (documents only). */
  documentId?: string;
  /** Raw category string (documents only). */
  category?: string | null;
  /** Original archive tags (documents only). */
  tags?: string[];
}

/**
 * Edge attributes stored on the graphology instance.
 */
export interface GraphEdgeAttributes extends Attributes {
  /** Edge kind — distinguishes "doc → category" bonds from "doc ↔ doc" tag bridges. */
  kind: GraphLinkKind;
  /** Weight used by the layout. For tag edges, lower-is-stronger bridge score. */
  weight: number;
  /** Strongest shared tag, when kind === "tag". */
  sharedTag?: string;
}

/**
 * Mutable interaction state, shared by the renderer and the
 * orchestrator component.
 *
 * The renderer receives a snapshot of this state on every change and
 * the sigma `nodeReducer` / `edgeReducer` transform the static graph
 * attributes into per-frame visual decisions.
 */
export interface InteractionState {
  /** Node currently under the cursor (or null). */
  hoveredNodeId: string | null;
  /** Node currently selected (or null). */
  selectedNodeId: string | null;
  /** Pre-computed first-degree neighbor ids of the focused node. */
  focusNeighborIds: ReadonlySet<string>;
  /** When true, only the focused node and its neighbors are visible. */
  focusModeEnabled: boolean;
}

/**
 * Build-time representation of a graph before it is loaded into graphology.
 * Kept distinct from graphology types so the test suite can exercise the
 * builder without pulling the runtime graph library.
 */
export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  docCount?: number;
  fileKind?: DocFileKind;
  documentId?: string;
  category?: string | null;
  tags?: string[];
}

export interface GraphLink {
  source: string;
  target: string;
  kind: GraphLinkKind;
  weight: number;
  sharedTag?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Graph statistics shown in the toolbar above the graph.
 */
export interface GraphStats {
  documents: number;
  categories: number;
  tagBridges: number;
}

/** Returns the empty/default interaction state. */
export function emptyInteractionState(): InteractionState {
  return {
    hoveredNodeId: null,
    selectedNodeId: null,
    focusNeighborIds: new Set<string>(),
    focusModeEnabled: false,
  };
}

/** Canonical id for a category hub node. */
export const CATEGORY_NODE_ID = (cat: string): string => `cat::${cat}`;

/**
 * Concrete graphology node/edge attribute types used at runtime.
 * Kept separate from the build-time `GraphNode`/`GraphLink` shapes
 * (which are used by the builder and tests without graphology).
 */
export interface RuntimeNodeAttributes {
  label: string;
  kind: GraphNodeKind;
  docCount?: number;
  fileKind?: DocFileKind;
  documentId?: string;
  category?: string | null;
  tags?: string[];
  /** x position in graph units. Required by FA2. */
  x?: number;
  /** y position in graph units. Required by FA2. */
  y?: number;
}

export interface RuntimeEdgeAttributes {
  kind: GraphLinkKind;
  weight: number;
  sharedTag?: string;
}
