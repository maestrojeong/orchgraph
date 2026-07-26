import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import {
  layoutTerminalGraph,
  parseGraphDocument,
  renderTerminalCanvas,
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

  test("style() builds decorators from named colors instead of raw ANSI codes", () => {
    expect(style({ color: "red" })("X")).toBe("[31mX[0m");
    expect(style({ color: "yellow", bold: true })("X")).toBe("[1;33mX[0m");
    expect(style({ invert: true })("X")).toBe("[7mX[0m");
    expect(style({ color: "orange" })("X")).toBe("[38;5;214mX[0m");
    expect(style({})("X")).toBe("X");
    expect(stripAnsi(style({ color: "orange", bold: true })("X"))).toBe("X");
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
