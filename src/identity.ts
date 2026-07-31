interface EdgeIdentityInput {
  id?: string | undefined;
  kind?: string | undefined;
  source: string;
  target: string;
}

/**
 * Resolves optional edge ids deterministically within each relationship.
 * Adding an unrelated edge no longer renumbers every edge after it.
 *
 * Parallel anonymous edges still use an occurrence suffix. Hosts that retain
 * selection or animation state across reordering should provide explicit ids.
 */
export function resolveEdgeIds(edges: readonly EdgeIdentityInput[]): string[] {
  const occurrences = new Map<string, number>();
  return edges.map((edge) => {
    if (edge.id) return edge.id;
    const base = `${edge.kind ?? "edge"}:${edge.source}:${edge.target}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return `${base}:${occurrence}`;
  });
}
