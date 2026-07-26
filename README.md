# Orchgraph

See who's working on what, right in your terminal — a renderer for
visualizing live agent and subagent orchestration.

Point it at a graph of who owns whom, who's delegating, who's talking to
whom, and who's still running, and Orchgraph turns that into a clean
box-drawing canvas laid out with ELK. Agent runtimes keep ownership of
execution, permissions, and state; Orchgraph owns graph validation, layout,
rendering, and viewport behavior — so a live subagent tree stays readable
whether it's printed once or animated every frame.

![Depth-two agent orchestration rendered by Orchgraph](https://raw.githubusercontent.com/maestrojeong/orchgraph/main/docs/images/depth-two.svg)

## Install

```bash
npm install orchgraph
```

## Build a graph

```ts
import { layoutTerminalGraph, renderTerminalCanvas } from "orchgraph";

const canvas = await layoutTerminalGraph({
  title: "Review graph",
  nodes: [
    { id: "lead", label: "Review lead", state: "running" },
    { id: "worker", label: "Worker", detail: "codex" },
  ],
  edges: [
    {
      source: "lead",
      target: "worker",
      kind: "delegation",
      label: "delegates",
      direction: "both",
    },
  ],
});

console.log(renderTerminalCanvas(canvas, { color: process.stdout.isTTY }).join("\n"));
```

Layout can be cancelled or bounded by a host application:

```ts
const controller = new AbortController();

const pendingCanvas = layoutTerminalGraph(document, {
  signal: controller.signal,
  timeoutMs: 15_000,
});

controller.abort();
await pendingCanvas; // rejects with AbortError
```

The graph document is deliberately small: nodes describe work and current
state, while edges describe delegation, verification, feedback, or any
application-defined relationship.

## Render live state

`layoutTerminalGraph` returns a clean, ANSI-free canvas. Apply terminal color
and animation only when writing a frame:

```ts
import { renderTerminalCanvas } from "orchgraph";

let animationFrame = 0;

setInterval(() => {
  const lines = renderTerminalCanvas(canvas, {
    color: true,
    animationFrame: animationFrame++,
  });
  process.stdout.write(`\u001b[H${lines.join("\n")}`);
}, 120);
```

Running nodes animate in bold yellow by default. Queued, blocked, succeeded,
and failed nodes have separate defaults. Hosts can replace any state style or
the running frames:

```ts
const lines = renderTerminalCanvas(canvas, {
  color: true,
  animationFrame,
  runningFrames: ["⠋", "⠙", "⠹", "⠸"],
  theme: {
    running: (marker, node) => `\u001b[38;5;214m${marker}\u001b[0m`,
    blocked: (marker, node) => `\u001b[7m${marker}\u001b[0m`,
  },
});
```

The decorator receives the full `TerminalNode`, including its state, bounds,
and marker position, so an existing TUI can use its own span or theme system
instead of ANSI.

Edges can be color-coded the same way, keyed by an edge's free-form `kind`
(e.g. `delegation`, `verification`, `feedback`) instead of node state:

```ts
const lines = renderTerminalCanvas(canvas, {
  color: true,
  edgeTheme: {
    delegation: (segment) => `[35m${segment}[0m`,
    verification: (segment) => `[36m${segment}[0m`,
    feedback: (segment) => `[33m${segment}[0m`,
  },
});
```

There is no built-in default palette for `edgeTheme` since `kind` values are
project-specific — supply a decorator only for the kinds you want to
distinguish.

## Embed in a TUI

Orchgraph does not own stdin, stdout, or the alternate screen:

```ts
import { terminalViewportLines } from "orchgraph/terminal";

const lines = terminalViewportLines(canvas, {
  x: 0,
  y: 0,
  width: 80,
  height: 24,
});
```

Canvas metadata exposes node bounds and edge cells for hit testing, panning,
selection, and live edge highlighting.

## CLI

```bash
npx orchgraph graph.json
cat graph.json | npx orchgraph --direction RIGHT --spacing 6 --color
```

## Examples

### Live subagent tree

A real orchestration host (Negotium) projecting its topic tree — ownership,
a status-only child, and cross-topic messaging between siblings — straight
from `subagentReportMode` and `subagentTellTargetIds` into a `GraphDocument`.

![Live subagent tree](https://raw.githubusercontent.com/maestrojeong/orchgraph/main/docs/images/negotium-subagents.svg)

### Delegation tree

One coordinator fans work out to independent agents.

![Delegation tree](https://raw.githubusercontent.com/maestrojeong/orchgraph/main/docs/images/delegation-tree.svg)

### Review loop

Implementation, review, and verification form an explicit feedback loop.

![Review loop](https://raw.githubusercontent.com/maestrojeong/orchgraph/main/docs/images/review-loop.svg)

### Recursive team

A depth-two team combines ownership, delegation, and cross-team messaging.

![Recursive review team](https://raw.githubusercontent.com/maestrojeong/orchgraph/main/docs/images/review-team.svg)

Run all source examples locally:

```bash
bun run examples
npx orchgraph examples/depth-two.json --color
```

## Runtime boundary

Orchgraph is an npm library, not a runtime adapter. A host application projects
its domain objects into `GraphDocument`:

```text
runtime domain objects -> projection function -> GraphDocument -> Orchgraph
```

For Negotium, a local `subagent-graph-projection.ts` maps topics, delegation,
reporting, and tell grants into generic nodes and edges. Orchgraph does not
import Negotium or communicate with its nodes.

## Development stack

- TypeScript with strict mode
- Node.js 20+ runtime
- Bun for installs and tests
- ELK.js for deterministic layered layout
- Zod for the public JSON contract
- Framework-free Unicode terminal renderer
- Biome for linting and formatting

See [Architecture](docs/architecture.md) and [Changelog](CHANGELOG.md).

## License

MIT
