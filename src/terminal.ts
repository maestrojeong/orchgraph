import { displayWidth } from "./terminal-width.js";
import type { NodeState, TerminalCanvas, TerminalNode } from "./types.js";

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TerminalNodeDecorator = (value: string, node: TerminalNode) => string;

export type TerminalStateTheme = Partial<Record<NodeState, TerminalNodeDecorator>>;

export interface TerminalRenderOptions {
  color?: boolean;
  animationFrame?: number;
  runningFrames?: readonly string[];
  theme?: TerminalStateTheme;
}

const RESET = "\u001b[0m";

export const defaultTerminalTheme: Readonly<TerminalStateTheme> = {
  queued: (value) => `\u001b[36m${value}${RESET}`,
  running: (value) => `\u001b[1;33m${value}${RESET}`,
  blocked: (value) => `\u001b[33m${value}${RESET}`,
  succeeded: (value) => `\u001b[32m${value}${RESET}`,
  failed: (value) => `\u001b[31m${value}${RESET}`,
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

function replaceAtDisplayColumn(value: string, column: number, replacement: string): string {
  const start = stringIndexAtDisplayColumn(value, column);
  const end = stringIndexAtDisplayColumn(value, column + 1);
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

export function renderTerminalCanvas(
  canvas: TerminalCanvas,
  options: TerminalRenderOptions = {},
): string[] {
  const lines = [...canvas.lines];
  const frame = Math.max(0, Math.trunc(options.animationFrame ?? 0));
  const runningFrames =
    options.runningFrames && options.runningFrames.length > 0
      ? options.runningFrames
      : DEFAULT_RUNNING_FRAMES;
  const theme = { ...defaultTerminalTheme, ...options.theme };

  for (const node of canvas.nodes) {
    const line = lines[node.markerY];
    if (line === undefined) continue;
    const marker =
      node.state === "running" ? (runningFrames[frame % runningFrames.length] ?? "●") : undefined;
    const source = marker ?? stringAtDisplayColumn(line, node.markerX);
    const decorator = options.color ? theme[node.state] : undefined;
    lines[node.markerY] = replaceAtDisplayColumn(
      line,
      node.markerX,
      decorator ? decorator(source, node) : source,
    );
  }
  return lines;
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
