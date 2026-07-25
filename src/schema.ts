import { z } from "zod";
import type { GraphDocument } from "./types.js";

const metadataSchema = z.record(z.string(), z.unknown());

const nodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().optional(),
  kind: z.string().optional(),
  state: z.enum(["idle", "queued", "running", "blocked", "succeeded", "failed"]).optional(),
  metadata: metadataSchema.optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1).optional(),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  kind: z.string().optional(),
  direction: z.enum(["forward", "backward", "both", "none"]).optional(),
  style: z.enum(["solid", "dashed"]).optional(),
  metadata: metadataSchema.optional(),
});

export const graphDocumentSchema = z
  .object({
    id: z.string().min(1).optional(),
    title: z.string().optional(),
    direction: z.enum(["DOWN", "UP", "LEFT", "RIGHT"]).optional(),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    metadata: metadataSchema.optional(),
  })
  .superRefine((graph, context) => {
    const ids = new Set<string>();
    for (const [index, node] of graph.nodes.entries()) {
      if (ids.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate node id: ${node.id}`,
          path: ["nodes", index, "id"],
        });
      }
      ids.add(node.id);
    }
    for (const [index, edge] of graph.edges.entries()) {
      if (!ids.has(edge.source)) {
        context.addIssue({
          code: "custom",
          message: `unknown source node: ${edge.source}`,
          path: ["edges", index, "source"],
        });
      }
      if (!ids.has(edge.target)) {
        context.addIssue({
          code: "custom",
          message: `unknown target node: ${edge.target}`,
          path: ["edges", index, "target"],
        });
      }
    }
  });

export function parseGraphDocument(value: unknown): GraphDocument {
  return graphDocumentSchema.parse(value) as GraphDocument;
}
