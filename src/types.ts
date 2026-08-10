export type GraphDirection = "DOWN" | "UP" | "LEFT" | "RIGHT";

export type NodeState = "idle" | "queued" | "running" | "blocked" | "succeeded" | "failed";
export type GraphMetadata = Record<string, unknown>;

export interface GraphNode {
  id: string;
  label: string;
  detail?: string;
  kind?: string;
  state?: NodeState;
  metadata?: GraphMetadata;
}

export type EdgeDirection = "forward" | "backward" | "both" | "none";
export type EdgeStyle = "solid" | "dashed";

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  kind?: string;
  direction?: EdgeDirection;
  style?: EdgeStyle;
  metadata?: GraphMetadata;
}

export interface GraphDocument {
  id?: string;
  title?: string;
  direction?: GraphDirection;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: GraphMetadata;
}

/** Renderer-neutral point in layout coordinates. */
export interface GraphPoint {
  x: number;
  y: number;
}

/** Renderer-neutral node bounds produced by a layout engine. */
export interface PositionedGraphNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedGraphLabel {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Renderer-neutral routed edge produced by a layout engine. */
export interface RoutedGraphEdge {
  id: string;
  sections: GraphPoint[][];
  labels: PositionedGraphLabel[];
}

/**
 * Layout output shared by all renderers. It deliberately contains geometry
 * only; runtime state, styling, and terminal glyphs belong to renderers.
 */
export interface GraphGeometry {
  nodes: PositionedGraphNode[];
  edges: RoutedGraphEdge[];
  width: number;
  height: number;
}

export interface TerminalNode {
  id: string;
  label: string;
  detail?: string;
  kind?: string;
  state: NodeState;
  metadata?: GraphMetadata;
  x: number;
  y: number;
  width: number;
  height: number;
  markerX: number;
  markerY: number;
}

export interface TerminalEdge {
  id: string;
  source: string;
  target: string;
  kind?: string;
  metadata?: GraphMetadata;
  cells: Array<{ x: number; y: number }>;
}

export interface TerminalCanvas {
  id?: string;
  title?: string;
  metadata?: GraphMetadata;
  nodes: TerminalNode[];
  edges: TerminalEdge[];
  lines: string[];
  width: number;
  height: number;
}

export interface LayoutControls {
  direction?: GraphDirection;
  spacing?: number;
  /** Maximum node width in layout units. Default: 48. */
  maxNodeWidth?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface LayoutEngine {
  layout(graph: GraphDocument, options?: LayoutControls): Promise<GraphGeometry>;
}

export interface LayoutOptions extends LayoutControls {
  engine?: LayoutEngine;
}
