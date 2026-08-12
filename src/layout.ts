import { createRequire } from "node:module";
import { Worker as ThreadWorker } from "node:worker_threads";
import ElkApiImport from "elkjs/lib/elk-api.js";
import WebWorker from "web-worker";
import { resolveEdgeIds } from "./identity.js";
import { parseGraphDocument } from "./schema.js";
import { displayWidth, graphemes } from "./terminal-width.js";
import { DEFAULT_MAX_NODE_WIDTH, layoutNodeText, MIN_NODE_WIDTH } from "./text-layout.js";
import type {
  EdgeDirection,
  GraphDocument,
  GraphEdge,
  GraphGeometry,
  GraphNode,
  LayoutControls,
  LayoutEngine,
  LayoutOptions,
  TerminalCanvas,
} from "./types.js";

interface Point {
  x: number;
  y: number;
}

interface ElkSection {
  startPoint: Point;
  endPoint: Point;
  bendPoints?: Point[];
}

interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface ElkEdge {
  id: string;
  sections?: ElkSection[];
  labels?: Array<{
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
}

interface ElkResult {
  width?: number;
  height?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
}

type ElkInstance = {
  layout(input: ReturnType<typeof layoutInput>): Promise<ElkResult>;
  terminateWorker(): void;
};

interface ElkWorker {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

type ElkConstructor = new (options: {
  workerUrl: string;
  workerFactory: (url?: string) => ElkWorker;
}) => ElkInstance;

const require = createRequire(import.meta.url);
const elkWorkerUrl = require.resolve("elkjs/lib/elk-worker.min.js");
const elkModule = ElkApiImport as unknown as ElkConstructor | { default: ElkConstructor };
const ElkApi = typeof elkModule === "function" ? elkModule : elkModule.default;

const NODE_WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const imported = require(workerData);
const Worker = imported.Worker || (imported.default && imported.default.Worker);
const worker = new Worker();
worker.onmessage = ({ data }) => parentPort.postMessage(data);
parentPort.on("message", (data) => worker.postMessage(data));
`;

class NodeElkWorker implements ElkWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly #worker: ThreadWorker;
  readonly #pendingIds = new Set<number>();
  #terminating = false;

  constructor(workerPath: string) {
    this.#worker = new ThreadWorker(NODE_WORKER_SOURCE, {
      eval: true,
      execArgv: process.execArgv.filter((argument) => !argument.startsWith("--input-type")),
      workerData: workerPath,
    });
    this.#worker.on("message", (data: { id?: number }) => {
      if (typeof data.id === "number") this.#pendingIds.delete(data.id);
      this.onmessage?.({ data });
    });
    this.#worker.on("error", (error) => {
      this.#rejectPending(error);
    });
    this.#worker.on("exit", (code) => {
      if (!this.#terminating && code !== 0) {
        this.#rejectPending(new Error(`ELK worker exited with code ${code}`));
      }
    });
  }

  #rejectPending(error: Error): void {
    for (const id of this.#pendingIds) {
      this.onmessage?.({
        data: { id, error: { message: error.message, stack: error.stack } },
      });
    }
    this.#pendingIds.clear();
  }

  postMessage(message: unknown): void {
    if (
      typeof message === "object" &&
      message !== null &&
      "id" in message &&
      typeof message.id === "number"
    ) {
      this.#pendingIds.add(message.id);
    }
    this.#worker.postMessage(message);
  }

  terminate(): void {
    this.#terminating = true;
    void this.#worker.terminate();
  }
}

const MIN_SPACING = 2;
const MAX_SPACING = 20;

function normalizedSpacing(value = 4): number {
  if (!Number.isFinite(value)) return 4;
  return Math.min(MAX_SPACING, Math.max(MIN_SPACING, Math.round(value)));
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("The graph layout was aborted", "AbortError");
}

function layoutWithControls(
  elk: ElkInstance,
  input: ReturnType<typeof layoutInput>,
  options: LayoutControls,
): Promise<ElkResult> {
  const { signal } = options;
  if (signal?.aborted) return Promise.reject(abortReason(signal));

  const timeoutMs =
    options.timeoutMs === undefined ? undefined : Math.max(1, Math.trunc(options.timeoutMs));
  return new Promise<ElkResult>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      if (timer !== undefined) clearTimeout(timer);
      action();
    };
    const onAbort = (): void => {
      elk.terminateWorker();
      settle(() => reject(signal ? abortReason(signal) : new Error("Graph layout aborted")));
    };
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            elk.terminateWorker();
            settle(() => reject(new Error(`Graph layout timed out after ${timeoutMs}ms`)));
          }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    elk.layout(input).then(
      (result) => settle(() => resolve(result)),
      (error: unknown) =>
        settle(() => reject(error instanceof Error ? error : new Error(String(error)))),
    );
  });
}

function layoutInput(graph: GraphDocument, options: LayoutControls) {
  const spacing = normalizedSpacing(options.spacing);
  const direction = options.direction ?? graph.direction ?? "DOWN";
  const edgeIds = resolveEdgeIds(graph.edges);
  return {
    id: graph.id ?? "orchgraph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": `[top=1,left=1,bottom=1,right=1]`,
      "elk.spacing.nodeNode": String(spacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.max(2, spacing - 1)),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.max(1, spacing / 2)),
      "elk.layered.spacing.edgeEdgeBetweenLayers": String(Math.max(1, spacing / 2)),
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: graph.nodes.map((node) => {
      const text = layoutNodeText(node, options.maxNodeWidth ?? DEFAULT_MAX_NODE_WIDTH);
      return { id: node.id, width: text.width, height: text.height };
    }),
    edges: graph.edges.map((edge, index) => ({
      id: edgeIds[index] ?? `edge:${index}`,
      sources: [edge.source],
      targets: [edge.target],
      ...(edge.label
        ? {
            labels: [
              {
                id: `${edgeIds[index] ?? `edge:${index}`}:label`,
                text: edge.label,
                width: displayWidth(edge.label) + 2,
                height: 1,
              },
            ],
          }
        : {}),
    })),
  };
}

function rounded(value: number | undefined): number {
  return Math.max(0, Math.round(value ?? 0));
}

const DIR_UP = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 4;
const DIR_RIGHT = 8;

/** Direction bits contributed to the two cells sharing a unit step, so a cell
 * that only ever sees two opposite bits (a straight run) or two adjacent
 * bits (an elbow) can be told apart from a cell where multiple distinct
 * edges genuinely overlap (three or four bits). */
function stepBits(xStep: number, yStep: number): { forward: number; backward: number } {
  if (xStep > 0) return { forward: DIR_RIGHT, backward: DIR_LEFT };
  if (xStep < 0) return { forward: DIR_LEFT, backward: DIR_RIGHT };
  if (yStep > 0) return { forward: DIR_DOWN, backward: DIR_UP };
  return { forward: DIR_UP, backward: DIR_DOWN };
}

// Elbow glyphs (a single edge turning 90°). Unicode's box-drawing block has
// no dashed rounded-corner characters, so a dashed edge's turn intentionally
// renders with the same solid corner as a straight edge — the alternative
// (dropping the corner or reusing a straight dash glyph) reads as a broken
// line rather than a clean turn. Only the straight runs on either side of the
// corner stay dashed.
const CORNER_GLYPH: Record<number, string> = {
  [DIR_DOWN | DIR_RIGHT]: "╭",
  [DIR_DOWN | DIR_LEFT]: "╮",
  [DIR_UP | DIR_RIGHT]: "╰",
  [DIR_UP | DIR_LEFT]: "╯",
};

const SOLID_STRAIGHT_GLYPH: Record<number, string> = {
  [DIR_UP]: "│",
  [DIR_DOWN]: "│",
  [DIR_LEFT]: "─",
  [DIR_RIGHT]: "─",
  [DIR_UP | DIR_DOWN]: "│",
  [DIR_LEFT | DIR_RIGHT]: "─",
};

const DASHED_STRAIGHT_GLYPH: Record<number, string> = {
  [DIR_UP]: "┊",
  [DIR_DOWN]: "┊",
  [DIR_LEFT]: "┈",
  [DIR_RIGHT]: "┈",
  [DIR_UP | DIR_DOWN]: "┊",
  [DIR_LEFT | DIR_RIGHT]: "┈",
};

/**
 * Turns the set of directions that touch a cell into a single glyph.
 *
 * A cell with only two bits is either a straight run or a single elbow, so it
 * always renders as a clean corner (╭╮╰╯) instead of a crossing. A cell only
 * falls back to a T/cross glyph once three or more distinct directions meet
 * there, which is the actual signal that two different edges overlap.
 */
function glyphForDirections(mask: number, dashedOnly: boolean): string {
  const corner = CORNER_GLYPH[mask];
  if (corner) return corner;
  if (dashedOnly && DASHED_STRAIGHT_GLYPH[mask]) return DASHED_STRAIGHT_GLYPH[mask];
  const straight = SOLID_STRAIGHT_GLYPH[mask];
  if (straight) return straight;
  const up = (mask & DIR_UP) !== 0;
  const down = (mask & DIR_DOWN) !== 0;
  const left = (mask & DIR_LEFT) !== 0;
  const right = (mask & DIR_RIGHT) !== 0;
  if (up && down && right && !left) return "├";
  if (up && down && left && !right) return "┤";
  if (left && right && down && !up) return "┬";
  if (left && right && up && !down) return "┴";
  return "┼";
}

function arrow(from: Point, to: Point): string {
  return to.y > from.y ? "▼" : to.y < from.y ? "▲" : to.x > from.x ? "▶" : "◀";
}

function midpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return previous ? Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) : 0;
  });
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: Math.round(start.x + (end.x - start.x) * ratio),
        y: Math.round(start.y + (end.y - start.y) * ratio),
      };
    }
    remaining -= length;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

function marker(node: GraphNode): string {
  switch (node.state) {
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

function shouldPointFromStart(direction: EdgeDirection): boolean {
  return direction === "backward" || direction === "both";
}

function shouldPointToEnd(direction: EdgeDirection): boolean {
  return direction === "forward" || direction === "both";
}

function geometryFromElk(layout: ElkResult): GraphGeometry {
  return {
    width: rounded(layout.width),
    height: rounded(layout.height),
    nodes: (layout.children ?? []).map((node) => ({
      id: node.id,
      x: rounded(node.x),
      y: rounded(node.y),
      width: rounded(node.width),
      height: rounded(node.height),
    })),
    edges: (layout.edges ?? []).map((edge) => ({
      id: edge.id,
      sections: (edge.sections ?? []).map((section) =>
        [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
          x: rounded(point.x),
          y: rounded(point.y),
        })),
      ),
      labels: (edge.labels ?? []).map((label) => ({
        x: rounded(label.x),
        y: rounded(label.y),
        width: rounded(label.width),
        height: rounded(label.height),
      })),
    })),
  };
}

function renderCanvas(graph: GraphDocument, layout: GraphGeometry): TerminalCanvas {
  const width = Math.max(1, layout.width + 2);
  const height = Math.max(1, layout.height + 2);
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
  const put = (x: number, y: number, value: string) => {
    if (y < 0 || y >= height || x < 0 || x >= width) return;
    cells[y]?.splice(x, 1, value);
  };
  const putText = (x: number, y: number, value: string, maxWidth: number) => {
    let column = 0;
    for (const character of graphemes(value)) {
      const characterWidth = displayWidth(character);
      if (column + characterWidth > maxWidth) break;
      put(x + column, y, character);
      if (characterWidth === 2) put(x + column + 1, y, "");
      column += characterWidth;
    }
  };

  const edgeIds = resolveEdgeIds(graph.edges);
  const edgesById = new Map(
    graph.edges.map((edge, index) => {
      const id = edgeIds[index] ?? `edge:${index}`;
      return [id, { ...edge, id }] as const;
    }),
  );
  const terminalEdges: TerminalCanvas["edges"] = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];

  // Pass 1: walk every edge section and accumulate, per cell, which of the four
  // directions a line touches it from. A cell that only ever collects two bits
  // is a straight run or a single elbow (rendered as a clean corner); a cell
  // that collects three or four bits is where distinct edges actually overlap.
  const directionMask = new Map<string, number>();
  const styleCounts = new Map<string, { dashed: number; solid: number }>();
  const cellKey = (x: number, y: number) => `${x}:${y}`;
  const markDirection = (x: number, y: number, bit: number, dashed: boolean) => {
    const key = cellKey(x, y);
    directionMask.set(key, (directionMask.get(key) ?? 0) | bit);
    const counts = styleCounts.get(key) ?? { dashed: 0, solid: 0 };
    if (dashed) counts.dashed += 1;
    else counts.solid += 1;
    styleCounts.set(key, counts);
  };

  interface ResolvedEdge {
    edge: GraphEdge & { id: string };
    laidOutEdge: GraphGeometry["edges"][number];
    sections: Point[][];
  }
  const resolvedEdges: ResolvedEdge[] = [];

  for (const laidOutEdge of layout.edges) {
    const edge = edgesById.get(laidOutEdge.id);
    if (!edge) continue;
    const dashed = (edge.style ?? "solid") === "dashed";
    const sections: Point[][] = [];
    for (const section of laidOutEdge.sections) {
      const points = section.map((point) => ({ x: point.x + 1, y: point.y + 1 }));
      sections.push(points);
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (!from || !to) continue;
        const horizontal = from.y === to.y;
        const distance = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
        const xStep = horizontal ? Math.sign(to.x - from.x) : 0;
        const yStep = horizontal ? 0 : Math.sign(to.y - from.y);
        const { forward, backward } = stepBits(xStep, yStep);
        for (let offset = 0; offset < distance; offset += 1) {
          const fromX = from.x + xStep * offset;
          const fromY = from.y + yStep * offset;
          const toX = from.x + xStep * (offset + 1);
          const toY = from.y + yStep * (offset + 1);
          markDirection(fromX, fromY, forward, dashed);
          markDirection(toX, toY, backward, dashed);
        }
      }
    }
    resolvedEdges.push({ edge, laidOutEdge, sections });
  }

  // Pass 2: turn each accumulated direction set into its final glyph.
  for (const [key, mask] of directionMask) {
    const [x, y] = key.split(":").map(Number);
    if (x === undefined || y === undefined) continue;
    const counts = styleCounts.get(key);
    const dashedOnly = counts !== undefined && counts.solid === 0 && counts.dashed > 0;
    put(x, y, glyphForDirections(mask, dashedOnly));
  }

  // Pass 3: arrows, edge cell bookkeeping, and labels (order-independent overlays).
  for (const { edge, laidOutEdge, sections } of resolvedEdges) {
    const edgeCells = new Map<string, Point>();
    for (const points of sections) {
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (!from || !to) continue;
        const horizontal = from.y === to.y;
        const distance = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
        const xStep = horizontal ? Math.sign(to.x - from.x) : 0;
        const yStep = horizontal ? 0 : Math.sign(to.y - from.y);
        for (let offset = 0; offset <= distance; offset += 1) {
          const x = from.x + xStep * offset;
          const y = from.y + yStep * offset;
          edgeCells.set(`${x}:${y}`, { x, y });
        }
      }
      const first = points[0];
      const second = points[1];
      const last = points.at(-1);
      const beforeLast = points.at(-2);
      const direction = edge.direction ?? "forward";
      if (first && second && shouldPointFromStart(direction)) {
        const point = {
          x: first.x + Math.sign(second.x - first.x),
          y: first.y + Math.sign(second.y - first.y),
        };
        put(point.x, point.y, arrow(second, first));
        edgeCells.set(`${point.x}:${point.y}`, point);
      }
      if (last && beforeLast && shouldPointToEnd(direction)) {
        const point = {
          x: last.x - Math.sign(last.x - beforeLast.x),
          y: last.y - Math.sign(last.y - beforeLast.y),
        };
        put(point.x, point.y, arrow(beforeLast, last));
        edgeCells.set(`${point.x}:${point.y}`, point);
      }
      if (edge.label && points.length > 1) {
        const laidOutLabel = laidOutEdge.labels?.[0];
        const middle = laidOutLabel
          ? {
              x: laidOutLabel.x + 1 + Math.floor(laidOutLabel.width / 2),
              y: laidOutLabel.y + 1,
            }
          : midpoint(points);
        const text = ` ${edge.label} `;
        labels.push({ x: middle.x - Math.floor(displayWidth(text) / 2), y: middle.y, text });
      }
    }
    terminalEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.kind ? { kind: edge.kind } : {}),
      ...(edge.metadata ? { metadata: edge.metadata } : {}),
      cells: [...edgeCells.values()],
    });
  }

  for (const label of labels) putText(label.x, label.y, label.text, displayWidth(label.text));

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const terminalNodes: TerminalCanvas["nodes"] = [];
  for (const laidOutNode of layout.nodes) {
    const node = nodesById.get(laidOutNode.id);
    if (!node) continue;
    const x = laidOutNode.x + 1;
    const y = laidOutNode.y + 1;
    const nodeWidth = Math.max(4, laidOutNode.width);
    const nodeHeight = Math.max(4, laidOutNode.height);
    for (let row = 0; row < nodeHeight; row += 1) {
      for (let column = 0; column < nodeWidth; column += 1) put(x + column, y + row, " ");
    }
    put(x, y, "╭");
    put(x + nodeWidth - 1, y, "╮");
    put(x, y + nodeHeight - 1, "╰");
    put(x + nodeWidth - 1, y + nodeHeight - 1, "╯");
    for (let column = 1; column < nodeWidth - 1; column += 1) {
      put(x + column, y, "─");
      put(x + column, y + nodeHeight - 1, "─");
    }
    for (let row = 1; row < nodeHeight - 1; row += 1) {
      put(x, y + row, "│");
      put(x + nodeWidth - 1, y + row, "│");
    }
    const text = layoutNodeText(node, nodeWidth);
    text.labelLines.forEach((value, index) => {
      putText(
        x + 2,
        y + 1 + index,
        index === 0 ? `${marker(node)} ${value}` : `  ${value}`,
        nodeWidth - 3,
      );
    });
    text.detailLines.forEach((value, index) => {
      putText(x + 2, y + 1 + text.labelLines.length + index, value, nodeWidth - 3);
    });
    terminalNodes.push({
      id: node.id,
      label: node.label,
      ...(node.detail ? { detail: node.detail } : {}),
      ...(node.kind ? { kind: node.kind } : {}),
      state: node.state ?? "idle",
      ...(node.metadata ? { metadata: node.metadata } : {}),
      x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      markerX: x + 2,
      markerY: y + 1,
    });
  }

  return {
    ...(graph.id ? { id: graph.id } : {}),
    ...(graph.title ? { title: graph.title } : {}),
    ...(graph.metadata ? { metadata: graph.metadata } : {}),
    nodes: terminalNodes,
    edges: terminalEdges,
    lines: cells.map((row) => row.join("").trimEnd()),
    width,
    height,
  };
}

function validateLayoutControls(options: LayoutControls): void {
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
  ) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }
  if (
    options.maxNodeWidth !== undefined &&
    (!Number.isFinite(options.maxNodeWidth) || options.maxNodeWidth < MIN_NODE_WIDTH)
  ) {
    throw new RangeError(`maxNodeWidth must be at least ${MIN_NODE_WIDTH}`);
  }
}

export class ElkLayoutEngine implements LayoutEngine {
  async layout(graph: GraphDocument, options: LayoutControls = {}): Promise<GraphGeometry> {
    validateLayoutControls(options);
    if (options.signal?.aborted) throw abortReason(options.signal);
    if (graph.nodes.length === 0) {
      return { nodes: [], edges: [], width: 0, height: 0 };
    }
    const elk = new ElkApi({
      workerUrl: elkWorkerUrl,
      workerFactory: (url) =>
        process.versions.bun
          ? (new WebWorker(url ?? elkWorkerUrl) as unknown as ElkWorker)
          : new NodeElkWorker(url ?? elkWorkerUrl),
    });
    try {
      const result = await layoutWithControls(elk, layoutInput(graph, options), options);
      return geometryFromElk(result);
    } finally {
      elk.terminateWorker();
    }
  }
}

async function layoutParsedGraph(
  graph: GraphDocument,
  options: LayoutOptions,
): Promise<GraphGeometry> {
  validateLayoutControls(options);
  if (options.signal?.aborted) throw abortReason(options.signal);
  const engine = options.engine ?? new ElkLayoutEngine();
  return engine.layout(graph, options);
}

/** Computes renderer-neutral geometry using ELK or a host-provided engine. */
export async function layoutGraph(
  value: GraphDocument | unknown,
  options: LayoutOptions = {},
): Promise<GraphGeometry> {
  return layoutParsedGraph(parseGraphDocument(value), options);
}

/** Renders existing geometry without running a layout engine. */
export function renderTerminalGraph(
  value: GraphDocument | unknown,
  geometry: GraphGeometry,
): TerminalCanvas {
  const graph = parseGraphDocument(value);
  if (graph.nodes.length === 0) {
    return {
      ...(graph.id ? { id: graph.id } : {}),
      ...(graph.title ? { title: graph.title } : {}),
      ...(graph.metadata ? { metadata: graph.metadata } : {}),
      nodes: [],
      edges: [],
      lines: [],
      width: 0,
      height: 0,
    };
  }
  return renderCanvas(graph, geometry);
}

/** Backwards-compatible convenience pipeline: validate → layout → terminal render. */
export async function layoutTerminalGraph(
  value: GraphDocument | unknown,
  options: LayoutOptions = {},
): Promise<TerminalCanvas> {
  const graph = parseGraphDocument(value);
  const geometry = await layoutParsedGraph(graph, options);
  return renderTerminalGraph(graph, geometry);
}
