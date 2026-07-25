import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { layoutTerminalGraph, type NodeState } from "../src/index.js";

const examples = ["delegation-tree.json", "review-loop.json", "depth-two.json", "review-team.json"];
const outputDirectory = new URL("../docs/images/", import.meta.url);
const stateColors: Record<NodeState, string> = {
  idle: "#94a3b8",
  queued: "#22d3ee",
  running: "#facc15",
  blocked: "#f59e0b",
  succeeded: "#4ade80",
  failed: "#f87171",
};
const stateMarkers: Record<NodeState, string> = {
  idle: "○",
  queued: "◌",
  running: "◐",
  blocked: "◆",
  succeeded: "✓",
  failed: "✕",
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toSvg(
  title: string,
  lines: string[],
  nodes: Awaited<ReturnType<typeof layoutTerminalGraph>>["nodes"],
): string {
  const characterWidth = 8.4;
  const lineHeight = 18;
  const padding = 18;
  const columns = Math.max(1, ...lines.map((line) => [...line].length));
  const width = Math.ceil(columns * characterWidth + padding * 2);
  const height = Math.ceil((lines.length + 2) * lineHeight + padding * 2);
  const baseLines = [...lines];
  for (const node of nodes) {
    const line = baseLines[node.markerY];
    if (line !== undefined) {
      baseLines[node.markerY] = `${line.slice(0, node.markerX)} ${line.slice(node.markerX + 1)}`;
    }
  }
  const textLines = baseLines
    .map(
      (line, index) =>
        `<text x="${padding}" y="${padding + (index + 2) * lineHeight}" class="graph">${escapeXml(line || " ")}</text>`,
    )
    .join("\n");
  const markers = nodes
    .map((node) => {
      const x = padding + node.markerX * characterWidth;
      const y = padding + (node.markerY + 2) * lineHeight;
      return `<text x="${x}" y="${y}" class="marker" fill="${stateColors[node.state]}">${stateMarkers[node.state]}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <rect width="100%" height="100%" rx="8" fill="#111827"/>
  <text x="${padding}" y="${padding + lineHeight}" class="title">${escapeXml(title)}</text>
  <style>
    .title { fill: #f8fafc; font: 700 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .graph, .marker { font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }
    .graph { fill: #cbd5e1; }
    .marker { font-weight: 700; }
  </style>
${textLines}
${markers}
</svg>
`;
}

await mkdir(outputDirectory, { recursive: true });
for (const file of examples) {
  const source = new URL(`../examples/${file}`, import.meta.url);
  const document = JSON.parse(await readFile(source, "utf8"));
  const canvas = await layoutTerminalGraph(document);
  const name = basename(file, ".json");
  await writeFile(
    new URL(`${name}.txt`, outputDirectory),
    `${canvas.lines.join("\n").trimEnd()}\n`,
  );
  await writeFile(
    new URL(`${name}.svg`, outputDirectory),
    toSvg(canvas.title ?? name, canvas.lines, canvas.nodes),
  );
  process.stdout.write(`${join("docs/images", `${name}.svg`)}\n`);
}
