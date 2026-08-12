import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { GraphGeometry, LayoutEngine } from "../src/index.js";
import {
  displayWidth,
  layoutGraph,
  layoutTerminalGraph,
  parseGraphDocument,
  renderHtmlGraph,
  renderSvgGraph,
  renderTerminalCanvas,
  renderTerminalGraph,
  stripAnsi,
  style,
} from "../src/index.js";
import { clampViewport, terminalViewportLines } from "../src/terminal.js";

const graph = {
  title: "Test graph",
  nodes: [
    { id: "root", label: "루트", state: "running" as const },
    { id: "child", label: "Worker", detail: "codex" },
  ],
  edges: [{ source: "root", target: "child", label: "delegates" }],
};

describe("Orchgraph", () => {
  test("validates references", () => {
    expect(() =>
      parseGraphDocument({
        nodes: [{ id: "root", label: "Root" }],
        edges: [{ source: "root", target: "missing" }],
      }),
    ).toThrow("unknown target node");
  });

  test("rejects duplicate explicit edge ids", () => {
    expect(() =>
      parseGraphDocument({
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [
          { id: "message", source: "a", target: "b" },
          { id: "message", source: "b", target: "a" },
        ],
      }),
    ).toThrow("duplicate edge id: message");
  });

  test("exposes renderer-neutral geometry and renders it independently", async () => {
    const geometry = await layoutGraph(graph);
    const canvas = renderTerminalGraph(graph, geometry);

    expect(geometry.nodes).toHaveLength(graph.nodes.length);
    expect(geometry.edges).toHaveLength(graph.edges.length);
    expect(canvas.lines.join("\n")).toContain("delegates");
  });

  test("accepts a host-provided layout engine", async () => {
    const geometry: GraphGeometry = {
      width: 20,
      height: 8,
      nodes: [
        { id: "root", x: 1, y: 1, width: 14, height: 4 },
        { id: "child", x: 1, y: 6, width: 14, height: 4 },
      ],
      edges: [{ id: "edge:root:child:0", sections: [], labels: [] }],
    };
    const engine: LayoutEngine = {
      layout: async () => geometry,
    };

    expect(await layoutGraph(graph, { engine })).toBe(geometry);
  });

  test("lays out a graph as a terminal canvas", async () => {
    const canvas = await layoutTerminalGraph(graph);
    const output = canvas.lines.join("\n");

    expect(canvas.width).toBeGreaterThan(10);
    expect(canvas.height).toBeGreaterThan(8);
    expect(output).toContain("● 루트");
    expect(output).toContain("○ Worker");
    expect(output).toContain("delegates");
  });

  test("supports embeddable terminal viewports", async () => {
    const canvas = await layoutTerminalGraph(graph);
    const viewport = clampViewport(canvas, {
      x: 999,
      y: 999,
      width: 12,
      height: 4,
    });
    const lines = terminalViewportLines(canvas, viewport);

    expect(viewport.x).toBeLessThanOrEqual(canvas.width);
    expect(viewport.y).toBeLessThanOrEqual(canvas.height);
    expect(lines).toHaveLength(4);
  });

  test("slices terminal viewports by display columns", () => {
    const canvas = {
      nodes: [],
      edges: [],
      lines: ["한글abc"],
      width: 7,
      height: 1,
    };

    expect(terminalViewportLines(canvas, { x: 2, y: 0, width: 3, height: 1 })).toEqual(["글a"]);
    expect(terminalViewportLines(canvas, { x: 1, y: 0, width: 3, height: 1 })).toEqual([" 글"]);
  });

  test("renders an animated yellow running state without polluting the canvas", async () => {
    const canvas = await layoutTerminalGraph(graph);
    const rendered = renderTerminalCanvas(canvas, { color: true, animationFrame: 1 });

    expect(canvas.lines.join("\n")).not.toContain("\u001b[");
    expect(rendered.join("\n")).toContain("\u001b[1;33m◓\u001b[0m 루트");
  });

  test("allows host-defined state decoration", async () => {
    const canvas = await layoutTerminalGraph(graph);
    const rendered = renderTerminalCanvas(canvas, {
      color: true,
      theme: { running: (value, node) => `<active:${node.id}>${value}</active>` },
    });

    expect(rendered.join("\n")).toContain("<active:root>◐</active> 루트");
  });

  test("overlays live node state without recomputing or mutating layout", async () => {
    const canvas = await layoutTerminalGraph(graph);
    const rendered = renderTerminalCanvas(canvas, {
      color: true,
      nodeStates: { root: "failed" },
    });

    expect(rendered.join("\n")).toContain("\u001b[31m✕\u001b[0m 루트");
    expect(canvas.nodes[0]?.state).toBe("running");
    expect(canvas.lines.join("\n")).toContain("● 루트");
  });

  test("preserves graph metadata for renderer extensions", async () => {
    const canvas = await layoutTerminalGraph({
      id: "metadata-graph",
      metadata: { tenant: "acme" },
      nodes: [{ id: "a", label: "A", kind: "agent", metadata: { model: "codex" } }],
      edges: [],
    });

    expect(canvas.id).toBe("metadata-graph");
    expect(canvas.metadata).toEqual({ tenant: "acme" });
    expect(canvas.nodes[0]?.kind).toBe("agent");
    expect(canvas.nodes[0]?.metadata).toEqual({ model: "codex" });

    const geometry = await layoutGraph({
      id: "metadata-graph",
      metadata: { tenant: "acme" },
      nodes: [{ id: "a", label: "A" }],
      edges: [],
    });
    const svg = renderSvgGraph(
      {
        id: "metadata-graph",
        metadata: { tenant: "acme" },
        nodes: [{ id: "a", label: "A" }],
        edges: [],
      },
      geometry,
    );
    expect(svg).toContain('data-graph-id="metadata-graph"');
    expect(svg).toContain('data-metadata="{&quot;tenant&quot;:&quot;acme&quot;}"');
  });

  test("renders reusable geometry as escaped standalone SVG", async () => {
    const unsafeGraph = {
      title: "Review <graph>",
      nodes: [
        {
          id: "lead",
          label: "Lead <script>alert(1)</script>",
          detail: "codex & reviewer",
          state: "running" as const,
          metadata: { owner: '"ops"' },
        },
      ],
      edges: [],
    };
    const geometry = await layoutGraph(unsafeGraph);
    const svg = renderSvgGraph(unsafeGraph, geometry, {
      nodeStates: { lead: "failed" },
    });

    expect(svg).toStartWith("<svg");
    expect(svg).toContain("<title>Review &lt;graph&gt;</title>");
    expect(svg).toContain("orchgraph-node state-failed");
    expect(svg).toContain("Lead &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).not.toContain("<script>");
  });

  test("wraps long node text consistently across layout and renderers", async () => {
    const longGraph = {
      nodes: [
        {
          id: "long",
          label: "Persist decision graphs as reusable derived artifacts",
          detail:
            "Keep canonical data separate while making the rendered graph easy to inspect and share.",
        },
      ],
      edges: [],
    };
    const geometry = await layoutGraph(longGraph, { maxNodeWidth: 32 });
    const canvas = renderTerminalGraph(longGraph, geometry);
    const svg = renderSvgGraph(longGraph, geometry);
    const html = renderHtmlGraph(longGraph, geometry);

    expect(geometry.nodes[0]?.width).toBeLessThanOrEqual(32);
    expect(geometry.nodes[0]?.height).toBeGreaterThan(4);
    expect(canvas.lines.join("\n")).toContain("reusable derived");
    expect(svg).toContain("<tspan");
    expect(svg).toContain("reusable derived");
    expect(html).toContain("<br>");
  });

  test("renders reusable geometry as an embeddable HTML fragment", async () => {
    const geometry = await layoutGraph(graph);
    const html = renderHtmlGraph(graph, geometry, {
      nodeStates: { child: "succeeded" },
      className: "review-panel",
    });

    expect(html).toStartWith('<div class="orchgraph-html review-panel"');
    expect(html).toContain('class="orchgraph-html-node state-succeeded"');
    expect(html).toContain('data-node-id="child"');
    expect(html).toContain("<svg");
    expect(html).toContain("delegates");
  });

  test("style() builds decorators from named colors instead of raw ANSI codes", () => {
    expect(style({ color: "red" })("X")).toBe("[31mX[0m");
    expect(style({ color: "yellow", bold: true })("X")).toBe("[1;33mX[0m");
    expect(style({ invert: true })("X")).toBe("[7mX[0m");
    expect(style({ color: "orange" })("X")).toBe("[38;5;214mX[0m");
    expect(style({})("X")).toBe("X");
    expect(stripAnsi(style({ color: "orange", bold: true })("X"))).toBe("X");
  });

  test("measures combining characters and emoji grapheme clusters", () => {
    expect(displayWidth("e\u0301")).toBe(1);
    expect(displayWidth("👨‍💻")).toBe(2);
    expect(displayWidth("❤️")).toBe(2);
  });

  test("rejects unsupported CLI directions", () => {
    const result = Bun.spawnSync([
      "bun",
      fileURLToPath(new URL("../src/cli.ts", import.meta.url)),
      fileURLToPath(new URL("../examples/depth-two.json", import.meta.url)),
      "--direction",
      "SIDEWAYS",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("direction must be one of DOWN, UP, LEFT, RIGHT");
  });

  test("terminates an in-flight layout through AbortSignal", async () => {
    const controller = new AbortController();
    const layout = layoutTerminalGraph(graph, { signal: controller.signal });

    controller.abort();

    await expect(layout).rejects.toMatchObject({ name: "AbortError" });
  });

  test("terminates a layout after a host-defined timeout", async () => {
    await expect(layoutTerminalGraph(graph, { timeoutMs: 1 })).rejects.toThrow(
      "Graph layout timed out after 1ms",
    );
  });

  test("rejects invalid timeout values before starting layout work", async () => {
    await expect(layoutTerminalGraph(graph, { timeoutMs: 0 })).rejects.toThrow(
      "timeoutMs must be a positive finite number",
    );
  });

  test("rejects a maximum node width smaller than the minimum node", async () => {
    await expect(layoutGraph(graph, { maxNodeWidth: 10 })).rejects.toThrow(
      "maxNodeWidth must be at least 14",
    );
  });

  test("renders a clean elbow instead of a crossing where a dashed edge turns", async () => {
    const canvas = await layoutTerminalGraph({
      title: "Dashed bend",
      direction: "DOWN",
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ source: "a", target: "b", style: "dashed", direction: "backward" }],
    });
    const output = canvas.lines.join("\n");

    // A single edge turning a corner must render as an elbow (╭╮╰╯), never
    // as a crossing (┼┬┴├┤) — those are reserved for cells where two
    // different edges actually overlap.
    expect(output).toMatch(/[╭╮╰╯]/);
    expect(output).not.toContain("┼");
  });

  test("keeps distinct edge-kind colors intact when multiple decorations share a row", async () => {
    const canvas = await layoutTerminalGraph({
      title: "Two kinds",
      direction: "RIGHT",
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [
        { source: "a", target: "b", kind: "delegation" },
        { source: "b", target: "c", kind: "verification" },
      ],
    });

    const rendered = renderTerminalCanvas(canvas, {
      color: true,
      edgeTheme: {
        delegation: (value) => `[35m${value}[0m`,
        verification: (value) => `[36m${value}[0m`,
      },
    });
    const output = rendered.join("\n");

    // Each decorated cell must keep exactly the glyph the plain canvas had
    // at that position — no stray escape bytes leaking into the visible text
    // (the historical bug: a second decoration on the same row miscounted
    // display columns because it re-scanned a line that already contained
    // the first decoration's ANSI codes).
    expect(output).toContain("[35m");
    expect(output).toContain("[36m");
    expect(output).not.toMatch(/\d\d?m\d/); // e.g. "36m0m" from a corrupted split
    expect(stripAnsi(output)).toBe(canvas.lines.join("\n"));
  });

  test("highlights active edges without recomputing layout", async () => {
    const canvas = await layoutTerminalGraph(graph);
    const edgeId = canvas.edges[0]?.id;
    expect(edgeId).toBeDefined();

    const rendered = renderTerminalCanvas(canvas, {
      color: true,
      activeEdgeIds: new Set(edgeId ? [edgeId] : []),
    });

    expect(rendered.join("\n")).toContain("\u001b[1;36m");
    expect(stripAnsi(rendered.join("\n"))).toBe(renderTerminalCanvas(canvas).join("\n"));
  });

  test("exposes active edges and accessible node states in web renderers", async () => {
    const geometry = await layoutGraph(graph);
    const edgeId = geometry.edges[0]?.id;
    expect(edgeId).toBeDefined();
    const options = {
      nodeStates: { child: "succeeded" as const },
      activeEdgeIds: new Set(edgeId ? [edgeId] : []),
    };

    const svg = renderSvgGraph(graph, geometry, options);
    const html = renderHtmlGraph(graph, geometry, options);

    expect(svg).toContain('class="orchgraph-edge is-active"');
    expect(svg).toContain('data-active="true"');
    expect(svg).toContain('aria-label="Worker, succeeded"');
    expect(svg).toContain('class="orchgraph-node-state"');
    expect(svg).toContain(">✓</text>");
    expect(html).toContain('class="orchgraph-html-edge is-active"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-label="Worker, succeeded"');
    expect(html).toContain('class="orchgraph-html-node-state"');
    expect(html).toContain(">✓</span>");
  });

  test("renders every documented example with addressable geometry", async () => {
    const examples = new URL("../examples/", import.meta.url);
    const files = (await readdir(examples)).filter((file) => file.endsWith(".json"));

    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const graph = parseGraphDocument(JSON.parse(await readFile(new URL(file, examples), "utf8")));
      const canvas = await layoutTerminalGraph(graph);
      const output = canvas.lines.join("\n");

      expect(canvas.nodes).toHaveLength(graph.nodes.length);
      expect(canvas.edges).toHaveLength(graph.edges.length);
      expect(output).not.toContain("undefined");
      expect(output).not.toContain("\u001b[");
      for (const node of canvas.nodes) {
        expect(node.x + node.width).toBeLessThanOrEqual(canvas.width);
        expect(node.y + node.height).toBeLessThanOrEqual(canvas.height);
      }
    }
  });
});
