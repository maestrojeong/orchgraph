import { resolveEdgeIds } from "./identity.js";
import type { GraphDocument, GraphEdge, GraphGeometry, GraphNode, NodeState } from "./types.js";

export interface WebRenderStateOptions {
  /** Runtime-only state overlay. Applying it never recomputes graph layout. */
  nodeStates?: Readonly<Partial<Record<string, NodeState>>>;
  /** Runtime-only active edge IDs. Applying them never recomputes graph layout. */
  activeEdgeIds?: ReadonlySet<string>;
  /** Extra class placed on the renderer root. */
  className?: string;
  /** Prefix used by generated SVG definition ids. */
  idPrefix?: string;
  /** Include the renderer's default embedded styles. */
  includeStyles?: boolean;
}

export interface ResolvedWebGraph {
  nodes: Array<{
    graph: GraphNode;
    geometry: GraphGeometry["nodes"][number];
    state: NodeState;
  }>;
  edges: Array<{
    graph: GraphEdge;
    geometry: GraphGeometry["edges"][number];
    id: string;
    active: boolean;
  }>;
}

export function escapeMarkup(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function cssToken(value: string): string {
  const token = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return token || "unknown";
}

export function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function finiteNonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function metadataAttribute(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "";
  try {
    const json = JSON.stringify(metadata, (_key, value: unknown) =>
      typeof value === "bigint" ? String(value) : value,
    );
    return json ? ` data-metadata="${escapeMarkup(json)}"` : "";
  } catch {
    return "";
  }
}

export function rootClasses(base: string, extra: string | undefined): string {
  return [base, extra?.trim()].filter(Boolean).join(" ");
}

export function rendererIdPrefix(graph: GraphDocument, requested: string | undefined): string {
  return cssToken(requested ?? graph.id ?? "orchgraph");
}

export function resolveWebGraph(
  graph: GraphDocument,
  geometry: GraphGeometry,
  options: Pick<WebRenderStateOptions, "nodeStates" | "activeEdgeIds">,
): ResolvedWebGraph {
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const graphEdgeIds = resolveEdgeIds(graph.edges);
  const graphEdges = new Map(
    graph.edges.map((edge, index) => [graphEdgeIds[index] ?? `edge:${index}`, edge]),
  );

  return {
    nodes: geometry.nodes.flatMap((positioned) => {
      const node = graphNodes.get(positioned.id);
      if (!node) return [];
      return [
        {
          graph: node,
          geometry: positioned,
          state: options.nodeStates?.[node.id] ?? node.state ?? "idle",
        },
      ];
    }),
    edges: geometry.edges.flatMap((routed) => {
      const edge = graphEdges.get(routed.id);
      if (!edge) return [];
      return [
        {
          graph: edge,
          geometry: routed,
          id: routed.id,
          active: options.activeEdgeIds?.has(routed.id) ?? false,
        },
      ];
    }),
  };
}

export function edgeMarkerAttributes(edge: GraphEdge, markerId: string): string {
  const direction = edge.direction ?? "forward";
  const start =
    direction === "backward" || direction === "both"
      ? ` marker-start="url(#${escapeMarkup(markerId)})"`
      : "";
  const end =
    direction === "forward" || direction === "both"
      ? ` marker-end="url(#${escapeMarkup(markerId)})"`
      : "";
  return start + end;
}
