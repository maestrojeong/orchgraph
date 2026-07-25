import { createRequire } from "node:module";
import { Worker as ThreadWorker } from "node:worker_threads";
import ElkApiImport from "elkjs/lib/elk-api.js";
import WebWorker from "web-worker";
import { parseGraphDocument } from "./schema.js";
import { displayWidth } from "./terminal-width.js";
import type {
  EdgeDirection,
  EdgeStyle,
  GraphDocument,
  GraphEdge,
  GraphNode,
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
  options: LayoutOptions,
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

function edgeId(edge: GraphEdge, index: number): string {
  return edge.id ?? `${edge.kind ?? "edge"}:${edge.source}:${edge.target}:${index}`;
}

function layoutInput(graph: GraphDocument, options: LayoutOptions) {
  const spacing = normalizedSpacing(options.spacing);
  const direction = options.direction ?? graph.direction ?? "DOWN";
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
      const width = Math.max(displayWidth(node.label) + 6, displayWidth(node.detail ?? "") + 4, 14);
      return { id: node.id, width, height: 4 };
    }),
    edges: graph.edges.map((edge, index) => ({
      id: edgeId(edge, index),
      sources: [edge.source],
      targets: [edge.target],
      ...(edge.label
        ? {
            labels: [
              {
                id: `${edgeId(edge, index)}:label`,
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

function lineCharacter(
  existing: string,
  axis: "horizontal" | "vertical",
  style: EdgeStyle,
): string {
  const glyph =
    style === "dashed" ? (axis === "horizontal" ? "┈" : "┊") : axis === "horizontal" ? "─" : "│";
  if (existing === " " || existing === glyph) return glyph;
  if ("─┈".includes(existing) && axis === "horizontal") return existing;
  if ("│┊".includes(existing) && axis === "vertical") return existing;
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

function renderCanvas(graph: GraphDocument, layout: ElkResult): TerminalCanvas {
  const width = Math.max(1, rounded(layout.width) + 2);
  const height = Math.max(1, rounded(layout.height) + 2);
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
  const put = (x: number, y: number, value: string) => {
    if (y < 0 || y >= height || x < 0 || x >= width) return;
    cells[y]?.splice(x, 1, value);
  };
  const putText = (x: number, y: number, value: string, maxWidth: number) => {
    let column = 0;
    for (const character of [...value]) {
      const characterWidth = displayWidth(character);
      if (column + characterWidth > maxWidth) break;
      put(x + column, y, character);
      if (characterWidth === 2) put(x + column + 1, y, "");
      column += characterWidth;
    }
  };

  const edgesById = new Map(
    graph.edges.map((edge, index) => [edgeId(edge, index), { ...edge, id: edgeId(edge, index) }]),
  );
  const terminalEdges: TerminalCanvas["edges"] = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];

  for (const laidOutEdge of layout.edges ?? []) {
    const edge = edgesById.get(laidOutEdge.id);
    if (!edge) continue;
    const edgeCells = new Map<string, Point>();
    for (const section of laidOutEdge.sections ?? []) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
        (point) => ({ x: rounded(point.x) + 1, y: rounded(point.y) + 1 }),
      );
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
          put(
            x,
            y,
            lineCharacter(
              cells[y]?.[x] ?? " ",
              horizontal ? "horizontal" : "vertical",
              edge.style ?? "solid",
            ),
          );
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
              x: rounded(laidOutLabel.x) + 1 + Math.floor(rounded(laidOutLabel.width) / 2),
              y: rounded(laidOutLabel.y) + 1,
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
      cells: [...edgeCells.values()],
    });
  }

  for (const label of labels) putText(label.x, label.y, label.text, displayWidth(label.text));

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const terminalNodes: TerminalCanvas["nodes"] = [];
  for (const laidOutNode of layout.children ?? []) {
    const node = nodesById.get(laidOutNode.id);
    if (!node) continue;
    const x = rounded(laidOutNode.x) + 1;
    const y = rounded(laidOutNode.y) + 1;
    const nodeWidth = Math.max(4, rounded(laidOutNode.width));
    const nodeHeight = Math.max(4, rounded(laidOutNode.height));
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
    putText(x + 2, y + 1, `${marker(node)} ${node.label}`, nodeWidth - 3);
    putText(x + 2, y + 2, node.detail ?? node.kind ?? "", nodeWidth - 3);
    terminalNodes.push({
      id: node.id,
      label: node.label,
      state: node.state ?? "idle",
      x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      markerX: x + 2,
      markerY: y + 1,
    });
  }

  return {
    ...(graph.title ? { title: graph.title } : {}),
    nodes: terminalNodes,
    edges: terminalEdges,
    lines: cells.map((row) => row.join("").trimEnd()),
    width,
    height,
  };
}

export async function layoutTerminalGraph(
  value: GraphDocument | unknown,
  options: LayoutOptions = {},
): Promise<TerminalCanvas> {
  const graph = parseGraphDocument(value);
  if (options.signal?.aborted) throw abortReason(options.signal);
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
  ) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }
  if (graph.nodes.length === 0) {
    return {
      ...(graph.title ? { title: graph.title } : {}),
      nodes: [],
      edges: [],
      lines: [],
      width: 0,
      height: 0,
    };
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
    return renderCanvas(graph, result);
  } finally {
    elk.terminateWorker();
  }
}
