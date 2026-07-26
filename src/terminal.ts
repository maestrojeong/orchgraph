import { style } from "./ansi.js";
import { displayWidth } from "./terminal-width.js";
import type { NodeState, TerminalCanvas, TerminalEdge, TerminalNode } from "./types.js";

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TerminalNodeDecorator = (value: string, node: TerminalNode) => string;

export type TerminalStateTheme = Partial<Record<NodeState, TerminalNodeDecorator>>;

export type TerminalEdgeDecorator = (value: string, edge: TerminalEdge) => string;

/** Maps an edge's `kind` (a free-form string set by the graph author, e.g.
 * "delegation", "verification", "feedback") to a decorator so different
 * kinds of relationships can be told apart even when they share the same
 * line style. There is no built-in default because `kind` is open-ended and
 * project-specific — hosts opt in by supplying their own palette. */
export type TerminalEdgeTheme = Record<string, TerminalEdgeDecorator>;

export interface TerminalRenderOptions {
  color?: boolean;
  animationFrame?: number;
  runningFrames?: readonly string[];
  theme?: TerminalStateTheme;
  edgeTheme?: TerminalEdgeTheme;
}

export const defaultTerminalTheme: Readonly<TerminalStateTheme> = {
  queued: style({ color: "cyan" }),
  running: style({ color: "yellow", bold: true }),
  blocked: style({ color: "yellow" }),
  succeeded: style({ color: "green" }),
  failed: style({ color: "red" }),
};

const DEFAULT_RUNNING_FRAMES = ["◐", "◓", "◑", "◒"] as const;

function stringIndexAtDisplayColumn(value: string, target: number): number {
  let column = 0;
  let index = 0;
  for (const character of value) {
    if (column >= target) return index;
    column += displayWidth(character);
    index += character.length;
  }
  return value.length;
}

export function renderTerminalCanvas(
  canvas: TerminalCanvas,
  options: TerminalRenderOptions = {},
): string[] {
  const frame = Math.max(0, Math.trunc(options.animationFrame ?? 0));
  const runningFrames =
    options.runningFrames && options.runningFrames.length > 0
      ? options.runningFrames
      : DEFAULT_RUNNING_FRAMES;
  const theme = { ...defaultTerminalTheme, ...options.theme };

  // Every lookup below reads from the plain (ANSI-free) `canvas.lines`, and
  // every decorated replacement is collected per row instead of being spliced
  // in immediately. Column math (stringIndexAtDisplayColumn) only ever runs
  // against plain text this way — if it ran against a line that already had
  // an earlier decoration's escape codes inserted into it, those codes would
  // throw off the display-column count for every decoration after the first
  // one on that row and corrupt the output.
  const decorationsByRow = new Map<number, Map<number, string>>();
  const decorate = (row: number, column: number, value: string) => {
    let columns = decorationsByRow.get(row);
    if (!columns) {
      columns = new Map();
      decorationsByRow.set(row, columns);
    }
    columns.set(column, value);
  };

  for (const node of canvas.nodes) {
    const line = canvas.lines[node.markerY];
    if (line === undefined) continue;
    const marker =
      node.state === "running" ? (runningFrames[frame % runningFrames.length] ?? "●") : undefined;
    const source = marker ?? stringAtDisplayColumn(line, node.markerX);
    const decorator = options.color ? theme[node.state] : undefined;
    decorate(node.markerY, node.markerX, decorator ? decorator(source, node) : source);
  }

  if (options.color && options.edgeTheme) {
    for (const edge of canvas.edges) {
      const decorator = edge.kind ? options.edgeTheme[edge.kind] : undefined;
      if (!decorator) continue;
      for (const cell of edge.cells) {
        const line = canvas.lines[cell.y];
        if (line === undefined) continue;
        // Node markers take priority over edge cells (they never overlap in
        // practice, but a decoration already recorded here wins on ties).
        if (decorationsByRow.get(cell.y)?.has(cell.x)) continue;
        const source = stringAtDisplayColumn(line, cell.x);
        if (source.trim() === "") continue;
        decorate(cell.y, cell.x, decorator(source, edge));
      }
    }
  }

  return canvas.lines.map((line, row) => {
    const columns = decorationsByRow.get(row);
    if (!columns) return line;
    let result = "";
    let cursor = 0;
    for (const column of [...columns.keys()].sort((a, b) => a - b)) {
      const start = stringIndexAtDisplayColumn(line, column);
      const end = stringIndexAtDisplayColumn(line, column + 1);
      if (start < cursor) continue; // overlapping cell already covered by a prior decoration
      result += line.slice(cursor, start) + columns.get(column);
      cursor = end;
    }
    return result + line.slice(cursor);
  });
}

function stringAtDisplayColumn(value: string, column: number): string {
  const start = stringIndexAtDisplayColumn(value, column);
  const end = stringIndexAtDisplayColumn(value, column + 1);
  return value.slice(start, end);
}

export function clampViewport(canvas: TerminalCanvas, viewport: Viewport): Viewport {
  const width = Math.max(1, Math.trunc(viewport.width));
  const height = Math.max(1, Math.trunc(viewport.height));
  return {
    x: Math.min(Math.max(0, canvas.width - width), Math.max(0, Math.trunc(viewport.x))),
    y: Math.min(Math.max(0, canvas.height - height), Math.max(0, Math.trunc(viewport.y))),
    width,
    height,
  };
}

export function terminalViewportLines(canvas: TerminalCanvas, viewport: Viewport): string[] {
  const clamped = clampViewport(canvas, viewport);
  return Array.from({ length: clamped.height }, (_, row) =>
    (canvas.lines[clamped.y + row] ?? "").slice(clamped.x, clamped.x + clamped.width),
  );
}
