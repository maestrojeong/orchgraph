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

// Every edge keeps its real `kind` (owns, tell, owns-parent-only), but the
// decorator also receives the full edge, so a single kind's decorator can
// still pick out one specific edge by id — letting the fleet highlight
// exactly one delegation link at a time instead of every "owns" edge at once.
function edgeTheme(activeEdgeId) {
  const byId = (segment, edge) =>
    edge.id === activeEdgeId ? ACTIVE_EDGE(segment) : DIM_EDGE(segment);
  return { owns: byId, "owns-parent-only": byId, tell: byId };
}

const base = JSON.parse(
  await readFile(new URL("../examples/subagent-fleet.json", import.meta.url), "utf8"),
);

function withStates(states) {
  return {
    ...base,
    nodes: base.nodes.map((node) => ({ ...node, state: states[node.id] ?? node.state ?? "idle" })),
  };
}

const RUN = "running";
const OK = "succeeded";

const steps = [
  {
    caption: "negotium starts",
    states: { negotium: RUN },
    activeEdgeId: undefined,
  },
  {
    caption: "negotium owns orchgraph-release-review",
    states: { negotium: RUN, "orchgraph-release-review": RUN },
    activeEdgeId: "owns:negotium:orchgraph-release-review",
  },
  {
    caption: "release-review owns smoke-tests",
    states: { negotium: RUN, "orchgraph-release-review": RUN, "smoke-tests": RUN },
    activeEdgeId: "owns:orchgraph-release-review:smoke-tests",
  },
  {
    caption: "negotium owns negotium-orchgraph-review",
    states: {
      negotium: RUN,
      "orchgraph-release-review": RUN,
      "smoke-tests": RUN,
      "negotium-orchgraph-review": RUN,
    },
    activeEdgeId: "owns:negotium:negotium-orchgraph-review",
  },
  {
    caption: "review lead owns docs-sync",
    states: {
      negotium: RUN,
      "orchgraph-release-review": RUN,
      "smoke-tests": RUN,
      "negotium-orchgraph-review": RUN,
      "docs-sync": RUN,
    },
    activeEdgeId: "owns:negotium-orchgraph-review:docs-sync",
  },
  {
    caption: "negotium fans out a status-only explainer",
    states: {
      negotium: RUN,
      "orchgraph-release-review": RUN,
      "smoke-tests": RUN,
      "negotium-orchgraph-review": RUN,
      "docs-sync": RUN,
      "orchgraph-explainer": RUN,
    },
    activeEdgeId: "owns-parent-only:negotium:orchgraph-explainer",
  },
  {
    caption: "review lead tells release-review",
    states: {
      negotium: RUN,
      "orchgraph-release-review": RUN,
      "smoke-tests": RUN,
      "negotium-orchgraph-review": OK,
      "docs-sync": RUN,
      "orchgraph-explainer": RUN,
    },
    activeEdgeId: "tell:negotium-orchgraph-review:orchgraph-release-review",
  },
  {
    caption: "smoke-tests and docs-sync wrap up",
    states: {
      negotium: RUN,
      "orchgraph-release-review": RUN,
      "smoke-tests": OK,
      "negotium-orchgraph-review": OK,
      "docs-sync": OK,
      "orchgraph-explainer": RUN,
    },
    activeEdgeId: undefined,
  },
  {
    caption: "everything wraps up",
    states: {
      negotium: OK,
      "orchgraph-release-review": OK,
      "smoke-tests": OK,
      "negotium-orchgraph-review": OK,
      "docs-sync": OK,
      "orchgraph-explainer": OK,
    },
    activeEdgeId: undefined,
  },
];

const TICK_MS = 150;
const STEP_TICKS = 11; // ~1.65s per step
const FLASH_TICKS = 3; // ~450ms bright pulse before settling to dim

let frame = 0;

process.stdout.write(HIDE_CURSOR);
try {
  for (const step of steps) {
    const graph = withStates(step.states);
    const canvas = await layoutTerminalGraph(graph, { spacing: 2 });

    for (let tick = 0; tick < STEP_TICKS; tick += 1) {
      const flashing = step.activeEdgeId !== undefined && tick < FLASH_TICKS;
      const lines = renderTerminalCanvas(canvas, {
        color: true,
        theme,
        animationFrame: frame,
        edgeTheme: edgeTheme(flashing ? step.activeEdgeId : undefined),
      });
      process.stdout.write(
        `${CLEAR_HOME}${lines.join("\n")}\n\n  ${style({ bold: true })(step.caption)}\n`,
      );
      frame += 1;
      await sleep(TICK_MS);
    }
  }
} finally {
  process.stdout.write(SHOW_CURSOR);
}
