# Architecture

## Scope

Orchgraph owns:

- a runtime-neutral graph document
- validation and stable layout inputs
- ELK.js layout
- terminal canvas rendering
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

- `orchgraph`: types, validation, and terminal graph layout
- `orchgraph/terminal`: terminal themes, animation, and viewport helpers

This keeps installation simple while preserving tree-shakable entry points.
Additional renderers should become subpath exports before they become separate
packages.

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
renderer without recomputing ELK layout.

Layout work runs in an external worker on Node.js and Bun. Hosts can cancel
that worker with `AbortSignal` or enforce a `timeoutMs` limit without leaving a
background layout running.

## Integration terminology

Runtime-specific conversion is a projection, not an adapter. In Negotium,
`subagent-graph-projection.ts` should convert `TopicDto` values into an
Orchgraph document. The existing terminal adapter remains the connection
boundary to the Negotium node.
