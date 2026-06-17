// Label strategy.
//
// Labels are controlled at two levels:
//
//  1. **Per-node decision** in `styles.ts > makeNodeReducer`. The
//     reducer returns a `label` string (or `null` to hide) and a
//     `labelSize`. The `forceLabel` flag tells sigma to always draw
//     the label, regardless of culling.
//
//  2. **Sigma-level culling** via `labelRenderedSizeThreshold` (in
//     `styles.ts > defaultSigmaSettings`) and the camera `ratio`.
//     Sigma will skip labels whose on-screen pixel size is below the
//     threshold. This is what gives us the "labels appear when I zoom
//     in" behaviour for free.
//
// This file exposes the per-node decision logic so it can be tested
// in isolation, and helpers for truncating Arabic labels gracefully.

import type { InteractionState } from "./types.ts";

/**
 * Compute the visible label for a node, given the interaction state
 * and the node's attributes.
 *
 * Return value:
 *   - `null`            → never show a label
 *   - `string`          → show this label
 *
 * The function is pure: same inputs → same output.
 */
export function visibleLabel(
  baseLabel: string,
  isCategory: boolean,
  isHovered: boolean,
  isSelected: boolean,
  isNeighbor: boolean,
  state: InteractionState
): string | null {
  if (!baseLabel || baseLabel.length === 0) return null;
  if (isHovered || isSelected) return truncateLabel(baseLabel, 60);
  if (state.focusModeEnabled) {
    if (state.hoveredNodeId || state.selectedNodeId) {
      return isNeighbor ? truncateLabel(baseLabel, 28) : null;
    }
    return isCategory ? truncateLabel(baseLabel, 28) : null;
  }
  if (state.hoveredNodeId || state.selectedNodeId) {
    if (isNeighbor) return truncateLabel(baseLabel, 28);
    return null;
  }
  // No focus: let sigma's pixel-size culling decide.
  return isCategory
    ? truncateLabel(baseLabel, 28)
    : truncateLabel(baseLabel, 18);
}

/**
 * Truncate a label with an Arabic-friendly ellipsis.
 *
 * Arabic is a right-to-left script: the visual "tail" of a word is
 * the *left* side, so the ellipsis should appear there. We use the
 * U+2026 horizontal ellipsis "…" which the browser's bidi algorithm
 * will position correctly inside an RTL run.
 */
export function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  if (maxChars <= 1) return "…";
  return `${label.slice(0, Math.max(1, maxChars - 1))}…`;
}
