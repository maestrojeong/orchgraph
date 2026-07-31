import { parseGraphDocument } from "./schema.js";
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

export interface SvgRenderOptions extends WebRenderStateOptions {
  /** Space around the graph in geometry units. Default: 2. */
  padding?: number;
  /** CSS-pixel size of one geometry unit. Default: 8. */
  pixelScale?: number;
  /** Accessible title overriding GraphDocument.title. */
  title?: string;
}

const DEFAULT_STYLES = `
.orchgraph-svg { background: #0d1117; color: #e6edf3; }
.orchgraph-edge { fill: none; stroke: #6e7681; stroke-width: .18; }
.orchgraph-edge.is-dashed { stroke-dasharray: .55 .4; }
.orchgraph-edge-label { fill: #8b949e; font: 1.1px ui-monospace, monospace; text-anchor: middle; }
.orchgraph-node rect { fill: #161b22; stroke: #6e7681; stroke-width: .18; }
.orchgraph-node-label { fill: #e6edf3; font: 1.25px ui-monospace, monospace; font-weight: 600; text-anchor: middle; }
.orchgraph-node-detail { fill: #8b949e; font: 1px ui-monospace, monospace; text-anchor: middle; }
.orchgraph-node.state-running rect { stroke: #d29922; }
.orchgraph-node.state-blocked rect { stroke: #d29922; }
.orchgraph-node.state-succeeded rect { stroke: #3fb950; }
.orchgraph-node.state-failed rect { stroke: #f85149; }
.orchgraph-node.state-queued rect { stroke: #58a6ff; }
`.trim();

/**
 * Renders renderer-neutral geometry as a standalone SVG string.
 * User-provided text and metadata are escaped before interpolation.
 */
export function renderSvgGraph(
  value: GraphDocument | unknown,
  geometry: GraphGeometry,
  options: SvgRenderOptions = {},
): string {
  const graph = parseGraphDocument(value);
  const resolved = resolveWebGraph(graph, geometry, options.nodeStates);
  const padding = finiteNonNegative(options.padding, 2);
  const pixelScale = finitePositive(options.pixelScale, 8);
  const width = geometry.width + padding * 2;
  const height = geometry.height + padding * 2;
  const prefix = rendererIdPrefix(graph, options.idPrefix);
  const markerId = `${prefix}-arrow`;
  const title = options.title ?? graph.title;

  const edges = resolved.edges.flatMap(({ graph: edge, geometry: routed, id }) => {
    const classes = [
      "orchgraph-edge",
      edge.kind ? `kind-${cssToken(edge.kind)}` : "",
      edge.style === "dashed" ? "is-dashed" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const sections = routed.sections.map((section) => {
      const points = section.map((point) => `${point.x + padding},${point.y + padding}`).join(" ");
      return `<polyline class="${classes}" data-edge-id="${escapeMarkup(id)}"${edge.kind ? ` data-kind="${escapeMarkup(edge.kind)}"` : ""}${metadataAttribute(edge.metadata)} points="${points}"${edgeMarkerAttributes(edge, markerId)} />`;
    });
    const label = edge.label && routed.labels[0];
    if (edge.label && label) {
      sections.push(
        `<text class="orchgraph-edge-label" x="${label.x + label.width / 2 + padding}" y="${label.y + label.height + padding}">${escapeMarkup(edge.label)}</text>`,
      );
    }
    return sections;
  });

  const nodes = resolved.nodes.map(({ graph: node, geometry: positioned, state }) => {
    const x = positioned.x + padding;
    const y = positioned.y + padding;
    const center = x + positioned.width / 2;
    const classes = [
      "orchgraph-node",
      `state-${state}`,
      node.kind ? `kind-${cssToken(node.kind)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const detail = node.detail ?? node.kind;
    const labelY = detail ? y + positioned.height / 2 - 0.35 : y + positioned.height / 2 + 0.4;
    return [
      `<g class="${classes}" data-node-id="${escapeMarkup(node.id)}"${node.kind ? ` data-kind="${escapeMarkup(node.kind)}"` : ""}${metadataAttribute(node.metadata)}>`,
      `<rect x="${x}" y="${y}" width="${positioned.width}" height="${positioned.height}" rx=".45" />`,
      `<text class="orchgraph-node-label" x="${center}" y="${labelY}">${escapeMarkup(node.label)}</text>`,
      detail
        ? `<text class="orchgraph-node-detail" x="${center}" y="${y + positioned.height / 2 + 1.05}">${escapeMarkup(detail)}</text>`
        : "",
      "</g>",
    ]
      .filter(Boolean)
      .join("");
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="${escapeMarkup(rootClasses("orchgraph-svg", options.className))}" role="img" width="${width * pixelScale}" height="${height * pixelScale}" viewBox="0 0 ${width} ${height}">`,
    title ? `<title>${escapeMarkup(title)}</title>` : "",
    options.includeStyles === false ? "" : `<style>${DEFAULT_STYLES}</style>`,
    `<defs><marker id="${escapeMarkup(markerId)}" markerWidth="1.4" markerHeight="1.4" refX="1.1" refY=".7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L1.4,.7 L0,1.4 z" fill="context-stroke" /></marker></defs>`,
    `<g class="orchgraph-edges">${edges.join("")}</g>`,
    `<g class="orchgraph-nodes">${nodes.join("")}</g>`,
    "</svg>",
  ]
    .filter(Boolean)
    .join("");
}
