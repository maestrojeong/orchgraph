# Architecture

## Scope

Orchgraph owns:

- a runtime-neutral graph document
- validation and deterministic layout identities
- renderer-neutral `GraphGeometry`
- an injectable layout-engine boundary and built-in ELK.js engine
- terminal, SVG, and HTML rendering
- state-aware terminal decoration
- viewport primitives for embedding

Host applications own:

- runtime connections and event subscriptions
- domain-to-graph projection
- authentication and authorization
- execution commands and lifecycle state
- key bindings and surrounding UI

## Package surface

The first release is intentionally one npm package:

- `orchgraph`: types, validation, geometry layout, and terminal graph rendering
- `orchgraph/terminal`: terminal themes, animation, and viewport helpers
- `orchgraph/svg`: standalone SVG rendering
- `orchgraph/html`: embeddable HTML rendering

This keeps installation simple while preserving tree-shakable entry points.
Additional renderers should follow the same subpath-export pattern before they
become separate packages.

## Processing pipeline

The public pipeline has independent layout and render stages:

```text
unknown input
  -> GraphDocument validation
  -> LayoutEngine
  -> GraphGeometry
  -> TerminalCanvas -> state/theme decoration
  -> SVG string
  -> HTML fragment
```

`layoutTerminalGraph` remains the convenience wrapper around this pipeline.
Hosts that cache layout call `layoutGraph` and `renderTerminalGraph`
independently. Layout implementations conform to `LayoutEngine`, so adding a
backend does not require changing graph validation or terminal rendering.

`GraphGeometry` intentionally contains no runtime state, terminal glyph, ANSI
sequence, or renderer-specific metadata. Source node and edge metadata is
preserved on terminal, SVG, and HTML output for host-defined styling,
decorators, and hit-testing.

## Why no TUI framework

The library must embed inside existing terminal applications. React/Ink or
Blessed would impose an application lifecycle and compete with the host's
screen renderer. Orchgraph therefore returns a canvas and metadata instead of
owning stdin, stdout, or the alternate screen.

## State and live rendering

Layout output is always ANSI-free. Each terminal node retains its runtime state,
bounds, and marker location. `renderTerminalCanvas` decorates the current frame
without mutating that canvas. This split lets a host animate a running node,
replace the default yellow ANSI style, or map the metadata into its own span
renderer without recomputing ELK layout. `TerminalRenderOptions.nodeStates`
overlays current runtime state at frame-render time, so state-only updates do
not trigger layout work. SVG and HTML render options expose the same
`nodeStates` overlay and produce state/kind classes for host styling.

Layout work runs in an external worker on Node.js and Bun. Hosts can cancel
that worker with `AbortSignal` or enforce a `timeoutMs` limit without leaving a
background layout running.

## Integration terminology

Runtime-specific conversion is a projection, not an adapter. In Negotium,
`subagent-graph-projection.ts` should convert `TopicDto` values into an
Orchgraph document. The existing terminal adapter remains the connection
boundary to the Negotium node.
