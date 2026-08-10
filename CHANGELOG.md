# Changelog

All notable changes to this project are documented in this file.

## 0.2.1 - 2026-08-10

### Added

- Automatic display-width-aware wrapping for long node labels and details
  across terminal, SVG, and HTML renderers.
- `LayoutControls.maxNodeWidth` for host-specific node width limits, with a
  readable default that prevents long text from producing ultra-wide graphs.

## 0.2.0 - 2026-07-31

### Added

- Renderer-neutral `GraphGeometry`, `layoutGraph`, and `renderTerminalGraph`
  APIs so layout can be cached or consumed by additional renderers.
- Injectable `LayoutEngine` contract and exported built-in `ElkLayoutEngine`.
- Standalone `renderSvgGraph` and embeddable `renderHtmlGraph` renderers,
  available from the root package and the `orchgraph/svg` and
  `orchgraph/html` subpath exports.
- `TerminalRenderOptions.nodeStates` for live state updates without relayout.
- Graph, node, and edge metadata preservation on terminal output.
- Duplicate edge-id validation and relationship-scoped anonymous edge IDs.

## 0.1.2

### Added

- `style()`, a small helper that builds a `theme`/`edgeTheme` decorator from
  named options (`{ color: "orange", bold: true }`) instead of a raw ANSI
  escape sequence (`[1;38;5;214m`). Exported alongside `StyleOptions`
  and `TerminalColor`. `defaultTerminalTheme` is now implemented with it too.
- A live demo (`docs/images/live-demo.gif`, built from
  `scripts/demo-live.mjs`) showing node states and edge highlights changing
  over time, embedded at the top of the README.

## 0.1.1

### Fixed

- Edge corners now render as a proper elbow (`╭╮╰╯`) instead of a crossing
  (`┼`) wherever a single edge changes direction. Crossing glyphs
  (`┼┬┴├┤`) are now reserved for cells where two distinct edges actually
  overlap.
- `renderTerminalCanvas` no longer corrupts output when two or more cells on
  the same row are colorized (e.g. a node marker and a colored edge, or two
  differently-themed edges). Decorations are now computed against the plain
  canvas text and composed in a single pass instead of being re-applied on
  top of already-decorated (ANSI-containing) text.

### Added

- `TerminalRenderOptions.edgeTheme`, a `Record<string, TerminalEdgeDecorator>`
  keyed by `GraphEdge.kind`, so hosts can color-code edges by relationship
  type (e.g. `delegation` vs `verification`) the same way `theme` already
  color-codes nodes by state. Exported alongside the new
  `TerminalEdgeDecorator` and `TerminalEdgeTheme` types.

## 0.1.0

- Initial public release: ELK-based layered layout, terminal canvas
  rendering with box-drawing glyphs, node state theming, and the
  `orchgraph` CLI.
