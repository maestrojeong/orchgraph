import assert from "node:assert/strict";
import { renderHtmlGraph } from "../dist/html.js";
import { layoutGraph, layoutTerminalGraph, renderTerminalGraph } from "../dist/index.js";
import { renderSvgGraph } from "../dist/svg.js";
import { renderTerminalCanvas, terminalViewportLines } from "../dist/terminal.js";

const graph = {
  nodes: [
    { id: "root", label: "Root", state: "running" },
    { id: "worker", label: "Worker" },
  ],
  edges: [{ source: "root", target: "worker", label: "delegates" }],
};
const canvas = await layoutTerminalGraph(graph, { timeoutMs: 15_000 });
const geometry = await layoutGraph(graph, { timeoutMs: 15_000 });
const reusedCanvas = renderTerminalGraph(graph, geometry);

assert.match(renderTerminalCanvas(canvas).join("\n"), /Root/);
assert.match(renderTerminalCanvas(reusedCanvas).join("\n"), /delegates/);
assert.match(renderSvgGraph(graph, geometry), /^<svg/);
assert.match(renderHtmlGraph(graph, geometry), /^<div/);
assert.ok(terminalViewportLines(canvas, { x: 0, y: 0, width: 80, height: 24 }).length > 0);
console.log(`Node smoke passed on ${process.version}`);
