// Interaction model — hover, select, focus, neighbor lookup.
//
// Centralising these policies here keeps `renderer.ts` declarative
// and makes them unit-testable in isolation.
//
// The interaction model is intentionally simple:
//
//   - "focused"    = the node currently under the cursor OR the node
//                    the user clicked. The focused id is whichever is
//                    more recent (hovered beats selected when both
//                    are set).
//   - "neighbors"  = first-degree neighbors of the focused node, in
//                    either direction (graph is undirected).
//   - "touching"   = edges whose endpoints include the focused node OR
//                    both endpoints are in the neighbor set.
//
// These three sets drive the `nodeReducer` and `edgeReducer` in
// `styles.ts`.

import type Graph from "graphology";
import { emptyInteractionState, type InteractionState, type RuntimeEdgeAttributes, type RuntimeNodeAttributes } from "./types.ts";

/** Compute the id that is "in focus" right now. */
export function focusedId(state: InteractionState): string | null {
  return state.hoveredNodeId ?? state.selectedNodeId;
}

/** Is this node id part of the focused neighborhood? */
export function isInFocusSet(state: InteractionState, nodeId: string): boolean {
  const focused = focusedId(state);
  if (!focused) return true;
  if (nodeId === focused) return true;
  return state.focusNeighborIds.has(nodeId);
}

/** Build the neighbor id set for a given focused node, from a graphology graph. */
export function computeNeighborSet(
  graph: Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes>,
  focusedNode: string
): Set<string> {
  const out = new Set<string>();
  if (!graph.hasNode(focusedNode)) return out;
  graph.forEachNeighbor(focusedNode, (neighbor) => {
    out.add(neighbor);
  });
  return out;
}

/**
 * Build the set of edges that visually "touch" the focused node:
 *   - any edge with the focused node as an endpoint
 *   - any edge whose both endpoints are in the focused neighborhood
 *     (so when a hover highlights a 2-hop bridge, the connecting edge
 *     also lights up).
 */
export function computeTouchingEdgeSet(
  graph: Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes>,
  focusedNode: string | null,
  neighborIds: ReadonlySet<string>
): Set<string> {
  const out = new Set<string>();
  if (!focusedNode || !graph.hasNode(focusedNode)) return out;
  graph.forEachEdge(focusedNode, (edge) => {
    out.add(edge);
  });
  // Also include edges between two neighbors, so the cluster lights up
  // as a unit. This is the "focus mode" effect.
  if (neighborIds.size > 0) {
    for (const n of neighborIds) {
      graph.forEachEdge(n, (edge, _attrs, source, target) => {
        if (source === focusedNode || target === focusedNode) return;
        if (neighborIds.has(source) && neighborIds.has(target)) {
          out.add(edge);
        }
      });
    }
  }
  return out;
}

/**
 * Pure: derive a new interaction state from a "patch" + the graph.
 *
 * Recomputes the neighbor set when the focused node changes.
 */
export function deriveInteractionState(
  prev: InteractionState,
  graph: Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes> | null,
  patch: Partial<Pick<InteractionState, "hoveredNodeId" | "selectedNodeId" | "focusModeEnabled">>
): InteractionState {
  const next: InteractionState = { ...emptyInteractionState(), ...prev, ...patch };
  const focused = focusedId(next);
  if (!graph || !focused) {
    next.focusNeighborIds = new Set();
    return next;
  }
  if (focused !== focusedId(prev)) {
    next.focusNeighborIds = computeNeighborSet(graph, focused);
  }
  return next;
}
