import { parseGraphDocument } from "./schema.js";
import { layoutNodeText } from "./text-layout.js";
import type { GraphDocument, GraphGeometry } from "./types.js";
import {
  cssToken,
  edgeMarkerAttributes,
  escapeMarkup,
  finiteNonNegative,
  finitePositive,
  metadataAttribute,
  rendererIdPrefix,
  resolveWebGraph,
  rootClasses,
  type WebRenderStateOptions,
} from "./web-renderer.js";

export interface HtmlRenderOptions extends WebRenderStateOptions {
  /** Horizontal CSS pixels per geometry unit. Default: 8. */
  cellWidth?: number;
  /** Vertical CSS pixels per geometry unit. Default: 18. */
  cellHeight?: number;
  /** Space around the graph in geometry units. Default: 2. */
  padding?: number;
}

const DEFAULT_STYLES = `
.orchgraph-html { position: relative; overflow: hidden; background: #0d1117; color: #e6edf3; font-family: ui-monospace, monospace; }
.orchgraph-html-edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.orchgraph-html-edge { fill: none; stroke: #6e7681; stroke-width: 1.5; }
.orchgraph-html-edge.is-dashed { stroke-dasharray: 5 4; }
.orchgraph-html-edge-label { position: absolute; color: #8b949e; font-size: 11px; transform: translate(-50%, -50%); white-space: nowrap; }
.orchgraph-html-node { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #6e7681; border-radius: 6px; background: #161b22; }
.orchgraph-html-node-label { max-width: calc(100% - 8px); color: #e6edf3; font-size: 12px; font-weight: 600; line-height: 1.25; text-align: center; }
.orchgraph-html-node-detail { max-width: calc(100% - 8px); color: #8b949e; font-size: 10px; line-height: 1.25; text-align: center; }
.orchgraph-html-node.state-running, .orchgraph-html-node.state-blocked { border-color: #d29922; }
.orchgraph-html-node.state-succeeded { border-color: #3fb950; }
.orchgraph-html-node.state-failed { border-color: #f85149; }
.orchgraph-html-node.state-queued { border-color: #58a6ff; }
`.trim();

/**
 * Renders geometry as an embeddable HTML fragment with semantic node elements
 * and an SVG edge layer. User-provided values are escaped.
 */
export function renderHtmlGraph(
  value: GraphDocument | unknown,
  geometry: GraphGeometry,
  options: HtmlRenderOptions = {},
): string {
  const graph = parseGraphDocument(value);
  const resolved = resolveWebGraph(graph, geometry, options.nodeStates);
  const cellWidth = finitePositive(options.cellWidth, 8);
  const cellHeight = finitePositive(options.cellHeight, 18);
  const padding = finiteNonNegative(options.padding, 2);
  const width = (geometry.width + padding * 2) * cellWidth;
  const height = (geometry.height + padding * 2) * cellHeight;
  const prefix = rendererIdPrefix(graph, options.idPrefix);
  const markerId = `${prefix}-html-arrow`;

  const edges = resolved.edges.flatMap(({ graph: edge, geometry: routed, id }) => {
    const classes = [
      "orchgraph-html-edge",
      edge.kind ? `kind-${cssToken(edge.kind)}` : "",
      edge.style === "dashed" ? "is-dashed" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return routed.sections.map((section) => {
      const points = section
        .map((point) => `${(point.x + padding) * cellWidth},${(point.y + padding) * cellHeight}`)
        .join(" ");
      return `<polyline class="${classes}" data-edge-id="${escapeMarkup(id)}"${edge.kind ? ` data-kind="${escapeMarkup(edge.kind)}"` : ""}${metadataAttribute(edge.metadata)} points="${points}"${edgeMarkerAttributes(edge, markerId)} />`;
    });
  });

  const labels = resolved.edges.flatMap(({ graph: edge, geometry: routed, id }) => {
    const label = edge.label && routed.labels[0];
    if (!edge.label || !label) return [];
    const left = (label.x + label.width / 2 + padding) * cellWidth;
    const top = (label.y + label.height / 2 + padding) * cellHeight;
    return [
      `<span class="orchgraph-html-edge-label" data-edge-id="${escapeMarkup(id)}" style="left:${left}px;top:${top}px">${escapeMarkup(edge.label)}</span>`,
    ];
  });

  const nodes = resolved.nodes.map(({ graph: node, geometry: positioned, state }) => {
    const classes = [
      "orchgraph-html-node",
      `state-${state}`,
      node.kind ? `kind-${cssToken(node.kind)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const style = [
      `left:${(positioned.x + padding) * cellWidth}px`,
      `top:${(positioned.y + padding) * cellHeight}px`,
      `width:${positioned.width * cellWidth}px`,
      `height:${positioned.height * cellHeight}px`,
    ].join(";");
    const text = layoutNodeText(node, positioned.width);
    return [
      `<div class="${classes}" data-node-id="${escapeMarkup(node.id)}" data-state="${state}"${node.kind ? ` data-kind="${escapeMarkup(node.kind)}"` : ""}${metadataAttribute(node.metadata)} style="${style}">`,
      `<span class="orchgraph-html-node-label">${text.labelLines.map(escapeMarkup).join("<br>")}</span>`,
      text.detailLines.length > 0
        ? `<span class="orchgraph-html-node-detail">${text.detailLines.map(escapeMarkup).join("<br>")}</span>`
        : "",
      "</div>",
    ]
      .filter(Boolean)
      .join("");
  });

  return [
    `<div class="${escapeMarkup(rootClasses("orchgraph-html", options.className))}" role="group"${graph.title ? ` aria-label="${escapeMarkup(graph.title)}"` : ""}${graph.id ? ` data-graph-id="${escapeMarkup(graph.id)}"` : ""}${metadataAttribute(graph.metadata)} style="width:${width}px;height:${height}px">`,
    options.includeStyles === false ? "" : `<style>${DEFAULT_STYLES}</style>`,
    `<svg class="orchgraph-html-edges" aria-hidden="true" viewBox="0 0 ${width} ${height}"><defs><marker id="${escapeMarkup(markerId)}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 z" fill="context-stroke" /></marker></defs>${edges.join("")}</svg>`,
    labels.join(""),
    nodes.join(""),
    "</div>",
  ]
    .filter(Boolean)
    .join("");
}
