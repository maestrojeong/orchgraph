import type { NodeState } from "./types.js";

export function markerForState(state: NodeState): string {
  switch (state) {
    case "running":
      return "●";
    case "blocked":
      return "◆";
    case "succeeded":
      return "✓";
    case "failed":
      return "✕";
    case "queued":
      return "◌";
    default:
      return "○";
  }
}
