---
type: Decision
title: Effect at build time only
description: Effect is fenced entirely to the build step; the shipped pnpmfile carries zero Effect.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: freeze
    resource: package/src/plugin/freeze.ts
  - id: runtime-index
    resource: package/src/runtime/index.ts
  - id: enforcement
    resource: package/src/runtime/enforcement.ts
tags:
  - architecture
---

# Effect at build time only

## Context

`rolldown-pnpm-config` ships a `pnpmfile` as a pnpm config dependency, and a
pnpm config dependency cannot carry runtime dependencies — everything it
does at install time must already be bundled into a single dependency-free
artifact. The library's build-time stack is Effect v4. The question this
decision answers is where the boundary between "Effect may run" and "Effect
must not appear" falls.

## Decision

Effect is fenced entirely to `freeze`, the one build-time step, and never
crosses into the bundled runtime. The framing was "compile Effect away";
since statically erasing Effect's fiber runtime from an arbitrary program is
infeasible, the library instead draws a hard import boundary. `freeze`
imports `Effect`, `Data`, and `Schema` from `effect` and runs entirely inside
`Effect.gen`.[^freeze] The bundled runtime module,
`package/src/runtime/index.ts`, imports only from its own sibling modules
(`./ctx.js`, `./enforcement.js`, `./strategies/table.js`, `./types.js`,
`./warnings.js`) — no import from `effect` or any Effect-org
package.[^runtime-index] `package/src/runtime/enforcement.ts`, which
implements the divergence-response logic the runtime relies on, likewise
imports only its own local `./types.js`.[^enforcement] The zero-Effect
property of the bundled runtime is therefore verifiable directly from its
import graph, not merely asserted.

A direct consequence of the boundary is that `EnforcementError`, the error
the runtime throws when an `error`-enforced divergence is found, is defined
as a plain `Error` subclass (`export class EnforcementError extends Error`,
`package/src/runtime/enforcement.ts:11`) rather than an Effect tagged
error — it must survive bundling into a dependency-free pnpmfile, so it
cannot depend on any Effect type.[^enforcement]

## Alternatives rejected

- **Statically erase Effect's fiber runtime from the bundle.** Rejected as
  infeasible: there is no general transform that strips an arbitrary Effect
  program down to a fiber-runtime-free artifact while preserving its
  behavior.
- **Model `EnforcementError` as an Effect tagged error.** Rejected because a
  tagged error is an Effect-shaped value; carrying one across the
  build/runtime boundary would smuggle an Effect dependency into the
  zero-dependency pnpmfile the runtime must ship as. The class as written
  extends the plain global `Error`, with nothing from `effect` imported
  anywhere in `package/src/runtime/**`.[^enforcement]

## Consequences

- Every field validation, catalog normalization, and directive resolution
  Effect performs must complete inside `freeze` and reduce to plain
  serializable data before it can cross into `createHooks`.
- Any new build-time capability that wants to run inside the runtime instead
  of at build time must first be re-justified against this boundary — the
  default is that it belongs in `freeze`, not in the runtime.
- `EnforcementError`, and any error type the runtime throws, must stay a
  plain `Error` subclass; introducing an import from `effect` (or any
  Effect-org package) into `package/src/runtime/**` would break the
  verifiable zero-Effect import graph this decision relies on.

[^freeze]: freeze
[^runtime-index]: runtime-index
[^enforcement]: enforcement
