import assert from "node:assert/strict";
import { renderHtmlGraph } from "../dist/html.js";
import {
  displayWidth,
  layoutGraph,
  layoutTerminalGraph,
  renderTerminalGraph,
} from "../dist/index.js";
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
assert.equal(displayWidth("👨‍💻 é ❤️"), 7);
assert.deepEqual(
  terminalViewportLines(
    { nodes: [], edges: [], lines: ["한글abc"], width: 7, height: 1 },
    { x: 2, y: 0, width: 3, height: 1 },
  ),
  ["글a"],
);
console.log(`Node smoke passed on ${process.version}`);
