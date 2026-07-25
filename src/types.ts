export type GraphDirection = "DOWN" | "UP" | "LEFT" | "RIGHT";

export type NodeState = "idle" | "queued" | "running" | "blocked" | "succeeded" | "failed";

export interface GraphNode {
  id: string;
  label: string;
  detail?: string;
  kind?: string;
  state?: NodeState;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
}

export interface GraphDocument {
  id?: string;
  title?: string;
  direction?: GraphDirection;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: Record<string, unknown>;
}

export interface TerminalNode {
  id: string;
  label: string;
  state: NodeState;
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
  cells: Array<{ x: number; y: number }>;
}

export interface TerminalCanvas {
  title?: string;
  nodes: TerminalNode[];
  edges: TerminalEdge[];
  lines: string[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  direction?: GraphDirection;
  spacing?: number;
}
