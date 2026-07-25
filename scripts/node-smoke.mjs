import assert from "node:assert/strict";
import { layoutTerminalGraph, renderTerminalCanvas } from "../dist/index.js";
import { terminalViewportLines } from "../dist/terminal.js";

const canvas = await layoutTerminalGraph(
  {
    nodes: [
      { id: "root", label: "Root", state: "running" },
      { id: "worker", label: "Worker" },
    ],
    edges: [{ source: "root", target: "worker", label: "delegates" }],
  },
  { timeoutMs: 15_000 },
);

assert.match(renderTerminalCanvas(canvas).join("\n"), /Root/);
assert.ok(terminalViewportLines(canvas, { x: 0, y: 0, width: 80, height: 24 }).length > 0);
console.log(`Node smoke passed on ${process.version}`);
