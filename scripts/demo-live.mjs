import { readFile } from "node:fs/promises";
import { layoutTerminalGraph, renderTerminalCanvas, style } from "../dist/index.js";

const CLEAR_HOME = "[2J[H";
const HIDE_CURSOR = "[?25l";
const SHOW_CURSOR = "[?25h";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const theme = {
  idle: style({ color: "gray" }),
  queued: style({ color: "cyan" }),
  running: style({ color: "orange", bold: true }),
  succeeded: style({ color: "green" }),
  failed: style({ color: "red" }),
};

const ACTIVE_EDGE = style({ color: "orange", bold: true });
const DIM_EDGE = style({ dim: true });

function edgeTheme(activeKind) {
  const kinds = ["owns", "owns-parent-only", "tell"];
  return Object.fromEntries(
    kinds.map((kind) => [kind, kind === activeKind ? ACTIVE_EDGE : DIM_EDGE]),
  );
}

const base = JSON.parse(
  await readFile(new URL("../examples/negotium-subagents.json", import.meta.url), "utf8"),
);

function withStates(states) {
  return {
    ...base,
    nodes: base.nodes.map((node) => ({ ...node, state: states[node.id] ?? node.state ?? "idle" })),
  };
}

const steps = [
  {
    caption: "negotium spins up",
    states: { negotium: "running" },
    activeEdge: undefined,
  },
  {
    caption: "negotium owns two review subagents",
    states: { negotium: "running", "release-review": "queued", "orchgraph-review": "queued" },
    activeEdge: "owns",
  },
  {
    caption: "both review subagents start working",
    states: { negotium: "running", "release-review": "running", "orchgraph-review": "running" },
    activeEdge: undefined,
  },
  {
    caption: "review lead tells the release-review room",
    states: { negotium: "running", "release-review": "running", "orchgraph-review": "succeeded" },
    activeEdge: "tell",
  },
  {
    caption: "negotium fans out a status-only explainer",
    states: {
      negotium: "running",
      "release-review": "running",
      "orchgraph-review": "succeeded",
      explainer: "queued",
    },
    activeEdge: "owns-parent-only",
  },
  {
    caption: "everything wraps up",
    states: {
      negotium: "succeeded",
      "release-review": "succeeded",
      "orchgraph-review": "succeeded",
      explainer: "succeeded",
    },
    activeEdge: undefined,
  },
];

process.stdout.write(HIDE_CURSOR);
try {
  for (const step of steps) {
    const graph = withStates(step.states);
    const canvas = await layoutTerminalGraph(graph, { spacing: 3 });
    const lines = renderTerminalCanvas(canvas, {
      color: true,
      theme,
      edgeTheme: edgeTheme(step.activeEdge),
    });
    process.stdout.write(
      `${CLEAR_HOME}${lines.join("\n")}\n\n  ${style({ bold: true })(step.caption)}\n`,
    );
    await sleep(1400);
  }
} finally {
  process.stdout.write(SHOW_CURSOR);
}
