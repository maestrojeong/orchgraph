import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { layoutTerminalGraph, parseGraphDocument, renderTerminalCanvas } from "../src/index.js";
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
