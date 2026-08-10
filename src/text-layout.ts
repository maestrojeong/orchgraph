import { displayWidth, runeWidth } from "./terminal-width.js";
import type { GraphNode } from "./types.js";

export const DEFAULT_MAX_NODE_WIDTH = 48;
export const MIN_NODE_WIDTH = 14;

export interface NodeTextLayout {
  width: number;
  height: number;
  labelLines: string[];
  detailLines: string[];
}

function splitWideWord(value: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  let width = 0;
  for (const character of value) {
    const characterWidth = runeWidth(character);
    if (current && width + characterWidth > maxWidth) {
      parts.push(current);
      current = "";
      width = 0;
    }
    current += character;
    width += characterWidth;
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapDisplayText(value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const parts = displayWidth(word) > maxWidth ? splitWideWord(word, maxWidth) : [word];
      for (const part of parts) {
        const candidate = line ? `${line} ${part}` : part;
        if (line && displayWidth(candidate) > maxWidth) {
          lines.push(line);
          line = part;
        } else {
          line = candidate;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

export function layoutNodeText(
  node: Pick<GraphNode, "label" | "detail" | "kind">,
  maxNodeWidth = DEFAULT_MAX_NODE_WIDTH,
): NodeTextLayout {
  const widthLimit = Math.max(MIN_NODE_WIDTH, Math.floor(maxNodeWidth));
  const labelLines = wrapDisplayText(node.label, widthLimit - 6);
  const detail = node.detail ?? node.kind ?? "";
  const detailLines = detail ? wrapDisplayText(detail, widthLimit - 4) : [];
  const width = Math.min(
    widthLimit,
    Math.max(
      MIN_NODE_WIDTH,
      ...labelLines.map((line) => displayWidth(line) + 6),
      ...detailLines.map((line) => displayWidth(line) + 4),
    ),
  );
  return {
    width,
    height: Math.max(4, 2 + labelLines.length + detailLines.length),
    labelLines,
    detailLines,
  };
}
