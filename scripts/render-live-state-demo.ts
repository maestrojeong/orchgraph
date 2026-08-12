import { mkdir, writeFile } from "node:fs/promises";
import { layoutGraph, renderHtmlGraph, renderSvgGraph } from "../src/index.js";

const graph = {
  id: "live-review-flow",
  title: "Live orchestration state",
  direction: "DOWN" as const,
  nodes: [
    { id: "lead", label: "Review lead", detail: "plans and delegates" },
    { id: "research", label: "Evidence agent", detail: "collects sources" },
    { id: "writer", label: "Draft agent", detail: "waiting to synthesize" },
    { id: "verify", label: "Verifier", detail: "checking evidence" },
  ],
  edges: [
    {
      id: "delegate-research",
      source: "lead",
      target: "research",
      label: "delegates",
      kind: "delegation",
    },
    {
      id: "delegate-draft",
      source: "lead",
      target: "writer",
      label: "delegates",
      kind: "delegation",
    },
    {
      id: "return-evidence",
      source: "research",
      target: "verify",
      label: "evidence",
      kind: "result",
    },
    {
      id: "request-verification",
      source: "writer",
      target: "verify",
      label: "draft",
      kind: "verification",
      style: "dashed" as const,
    },
  ],
};

const geometry = await layoutGraph(graph, { spacing: 6 });
const outputDirectory = new URL("../docs/images/", import.meta.url);
const before = renderSvgGraph(graph, geometry, { title: "Before: structure only" });
const activeOptions = {
  title: "Live: evidence path active",
  nodeStates: {
    lead: "succeeded" as const,
    research: "succeeded" as const,
    writer: "queued" as const,
    verify: "running" as const,
  },
  activeEdgeIds: new Set(["delegate-research", "return-evidence"]),
};
const active = renderSvgGraph(graph, geometry, activeOptions);
const activeHtml = renderHtmlGraph(graph, geometry, activeOptions);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Orchgraph live state comparison</title>
  <style>
    body { margin: 0; background: #0d1117; color: #e6edf3; font: 14px ui-monospace, monospace; }
    main { max-width: 1440px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 20px; font-size: 20px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 14px; letter-spacing: 0; }
    section { padding: 18px 0 24px; border-top: 1px solid #30363d; overflow-x: auto; }
    img { display: block; max-width: none; }
  </style>
</head>
<body>
  <main>
    <h1>Orchgraph live state comparison</h1>
    <section><h2>Before: structure only</h2><img src="images/live-state-before.svg" alt="Inactive orchestration graph"></section>
    <section><h2>After: live node and edge overlays</h2><img src="images/live-state-active.svg" alt="Active orchestration graph"></section>
    <section><h2>HTML renderer</h2>${activeHtml}</section>
  </main>
</body>
</html>`;

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(new URL("live-state-before.svg", outputDirectory), before),
  writeFile(new URL("live-state-active.svg", outputDirectory), active),
  writeFile(new URL("../live-state-demo.html", outputDirectory), page),
]);
