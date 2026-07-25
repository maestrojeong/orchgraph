#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { layoutTerminalGraph } from "./layout.js";
import { renderTerminalCanvas } from "./terminal.js";

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    direction: { type: "string", short: "d" },
    spacing: { type: "string", short: "s" },
    help: { type: "boolean", short: "h" },
    color: { type: "boolean", short: "c" },
  },
});

if (values.help || positionals.length > 1) {
  process.stdout.write(
    "Usage: orchgraph [file.json] [--direction DOWN|UP|LEFT|RIGHT] [--spacing 2..20] [--color]\n" +
      "Reads a graph document from a file or stdin and renders a terminal graph.\n",
  );
  process.exit(0);
}

const input = positionals[0] ? await readFile(positionals[0], "utf8") : await readStdin();
const spacing = values.spacing ? Number(values.spacing) : undefined;
const direction = values.direction as "DOWN" | "UP" | "LEFT" | "RIGHT" | undefined;
const canvas = await layoutTerminalGraph(JSON.parse(input), {
  ...(typeof spacing === "number" && Number.isFinite(spacing) ? { spacing } : {}),
  ...(direction ? { direction } : {}),
});

if (canvas.title) process.stdout.write(`${canvas.title}\n\n`);
process.stdout.write(
  `${renderTerminalCanvas(canvas, { color: values.color ?? process.stdout.isTTY }).join("\n")}\n`,
);
