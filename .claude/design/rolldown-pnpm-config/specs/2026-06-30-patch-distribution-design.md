# Design: Dependency Patch Distribution

- **Date:** 2026-06-30
- **Status:** Proposed (branch `feat/patch-support`)
- **Branch:** `feat/patch-support`
- **Supersedes:** none (extends the Phase 1 engine in
  [`../architecture.md`](../architecture.md), the descriptor table in
  [`../settings-coverage.md`](../settings-coverage.md), and the export/preview
  local-merge pipeline in [`../export-cli.md`](../export-cli.md))

## Goal

Let a plugin author distribute pnpm dependency patches to consumers through their
config-dependency plugin, without hand-maintaining the divergence between where a
patch lives locally and where it resolves in a consumer. The author keeps using
stock pnpm (`pnpm patch` / `patch-commit`) and the `@savvy-web/bundler` public
asset convention; the plugin's only new responsibility is **rewriting patch path
strings** between the two coordinate systems, scoped per-plugin so multiple
config-dependencies and the repo's own patches coexist in one workspace.

## Background

Three facts from research establish the constraint surface (full notes in the
session that produced this spec):

1. **pnpm patch mechanics.** `pnpm patch <pkg>` extracts an edit copy;
   `pnpm patch-commit` writes a `.patch` file (default dir `patches/`, settable
   via `patchesDir` / `--patches-dir`, resolved relative to the lockfile/workspace
   root) and adds a `patchedDependencies` entry. `patchedDependencies` is a map of
   `pkg@version` (exact), `pkg@range`, or bare `pkg` to a patch-file path. The path
   is resolved `path.resolve(lockfileDir, value)`, so it may point at any
   subdirectory, including `public/patches/...`. The filename pnpm writes mangles a
   scoped name's `/` to `__` (e.g. `@scope/pkg@1.0.0` → `@scope__pkg@1.0.0.patch`).

2. **Config-dependency distribution.** This plugin ships as a pnpm
   config-dependency whose `updateConfig` hook injects managed fields into each
   consumer. A config-dependency installs at
   `node_modules/.pnpm-config/<name>/`. A `.patch` file shipped inside the package
   therefore resolves, in a consumer, at
   `node_modules/.pnpm-config/<name>/<subpath>`. Unlike vanilla config-dependencies
   (where the consumer must hand-register `patchedDependencies`), the
   `updateConfig` hook injects the registration automatically — this is the feature
   that makes patch distribution turnkey.

3. **Bundler asset copy.** `@savvy-web/bundler` copies `public/` (adjacent to
   `src/`) into `dist/{target}/`. So `public/patches/foo.patch` is published at
   `patches/foo.patch` inside the package and lands at
   `node_modules/.pnpm-config/<name>/patches/foo.patch` in a consumer — no plugin
   file-copying required.

The three relevant fields already exist in the descriptor table
(`package/src/descriptors/build.ts`): `patchedDependencies` (`stringRecord`,
`mapChildWins`, `warn`), `patchesDir` (`string`, `scalar`, `absent`),
`configDependencies` (`stringRecord`, `mapChildWins`, `absent`). The
local-vs-distributed override machinery already exists as `LocalDirective` and the
`export` local-merge pipeline (`package/src/cli/local-merge.ts`,
`package/src/define-plugin.ts`). This work adds path-rewrite + per-plugin discovery
on top of that existing surface; it does not add a new merge engine or a new
top-level authoring field.

## Principle

The bundler ships patch *files*; pnpm authors them. The plugin **only rewrites
path strings**, scoped per-plugin. Everything else is existing machinery.

## Ownership model

Each `PnpmConfigPlugin` instance owns patches in two directories resolved adjacent
to the file that constructs it (the build-config directory, from the bundler config
context), scoped by its `name`:

| Directory (adjacent to build file) | Convention origin | Class |
| ---------------------------------- | ----------------- | ----- |
| `patches/` | pnpm's default `patchesDir` | **local-only** — never enters `base` |
| `public/patches/` | tsdown / `@savvy-web/bundler` public assets | **distributed** — rewritten into `base` |

Rules:

- Discovery walks both directories. The `patchedDependencies` **key** is derived
  from each filename by reversing pnpm's `__` convention
  (`@scope__pkg@1.0.0.patch` ⇆ `@scope/pkg@1.0.0`; `react.patch` → bare `react`).
- **`patchesDir` is never read by the plugin.** It remains a pure author-side write
  convenience for `pnpm patch-commit`. It is not distributed (two plugins in one
  repo would otherwise fight over the single consumer-side value); its descriptor
  stays `absent`/unmanaged.
- A plugin claims only the patches under *its own* adjacent directories. Two
  distributing plugins in one repo (`@example/savvy`, `@example/rolldown`) never
  collide on disk because each rewrites under its own `.pnpm-config/<name>/` prefix.
- The repo's own patches (anywhere not under a plugin's owned directories, e.g. a
  root-level `patches/` belonging to no plugin) are claimed by nobody, never
  distributed, and preserved by `export`.

## Path rewrite

The rewrite is independent of `patchesDir`. For a distributed patch, the
distributed path is computed from `name` plus the patch's path relative to the
local discovery root:

```text
distributed = node_modules/.pnpm-config/<name>/<rel>
  where <rel> = patch path relative to the distributed source root
                (public/ by default, or localPatchesDir when that override is set)
```

Worked example (`name: "@example/savvy"`):

```text
local:       examples/savvy/public/patches/is-odd@3.0.1.patch
distributed: node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch
```

The local-only class is never rewritten — it appears only in the local `export`
output, never in `base`.

## Authoring surface

No new top-level authoring field. The behavior is expressed through the existing
`patchedDependencies` input and the `local` object, extended with strategy
directives:

| Where | Form | Effect |
| ----- | ---- | ------ |
| `patchedDependencies` | `<value>` (`Record<string,string>`) | explicit map, existing behavior, retained |
| `patchedDependencies` | `{ strategy: "rewrite" }` | discover `public/patches/`, rewrite each to the distributed path; result becomes `base.patchedDependencies` |
| `local.patchedDependencies` | `{ strategy: "merge" }` | on `export`, upsert this plugin's owned keys with their **local** on-disk paths, preserving every key it does not own |
| `local.localPatchesDir` | `string` (optional) | override the **distributed** source root (default `public/patches/`); when set, that single directory is the rewrite source. **Undefined ⇒ auto-detect** `public/patches/` adjacent to the build file. The local-only `patches/` detection is independent and unaffected. |

Defaults when the author declares neither directive but patch files exist:
`patchedDependencies` behaves as `{ strategy: "rewrite" }` and
`local.patchedDependencies` as `{ strategy: "merge" }`. The common case is
therefore zero configuration — drop a `.patch` file into the right folder and it is
wired. `localPatchesDir` is the escape hatch for non-standard layouts; the explicit
`<value>` form remains the full-manual escape hatch.

### Type changes

- `LocalDirective<T>` (in `package/src/define-plugin.ts`) gains `"merge"` and
  `"rewrite"` to its `strategy` union (currently `"union" | "difference"`).
  `"merge"` is the map-key-wise upsert that preserves unowned keys; `"rewrite"` is
  the local→distributed path transform. The existing `"union" | "difference"`
  semantics are unchanged.
- The `local` object type gains an optional `localPatchesDir?: string` sibling
  option (a config knob, not a per-field directive).
- The `patchedDependencies` field input is widened to accept the `{ strategy }`
  directive in addition to a bare map.

## Discovery and rewrite placement

- Discovery (filesystem reads) and the rewrite/key-derivation live in **one shared
  module** that both the build plugin and the `export` CLI call, so the two emit
  paths agree.
- Discovery runs in the **plugin/build layer**, producing a resolved patch list
  that feeds `freeze`'s input. `freeze` itself stays pure-data, preserving the
  Effect-at-build-time-only boundary (`base`/`manifest` carry no new code, only the
  rewritten string map).
- **Build** bakes the distributed entries into `base.patchedDependencies`.
- **`export`** writes local-path entries for all owned patches (distributed +
  local-only) into the repo's `pnpm-workspace.yaml`, merged by key.

## End-to-end walkthrough (two plugins + a repo-own patch)

Files on disk:

```text
examples/savvy/public/patches/is-odd@3.0.1.patch     # savvy, distributed
examples/savvy/patches/react.patch                   # savvy, local-only
examples/rolldown/public/patches/foo@2.0.0.patch     # rolldown, distributed
patches/bar@1.0.0.patch                              # repo's own, nobody's
```

`@example/savvy` build → `base.patchedDependencies`:

```yaml
is-odd@3.0.1: node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch
# react.patch is local-only → NOT in base
```

`@example/rolldown` build → its own `base.patchedDependencies`:

```yaml
foo@2.0.0: node_modules/.pnpm-config/@example/rolldown/patches/foo@2.0.0.patch
```

`@example/savvy export` → merges its owned keys into the root
`pnpm-workspace.yaml`, preserving the rest:

```yaml
patchedDependencies:
  is-odd@3.0.1: examples/savvy/public/patches/is-odd@3.0.1.patch   # owned, local path
  react: examples/savvy/patches/react.patch                       # owned, local path
  foo@2.0.0: examples/rolldown/public/patches/foo@2.0.0.patch      # untouched (rolldown's)
  bar@1.0.0: patches/bar@1.0.0.patch                              # untouched (repo's own)
```

At install, `mapChildWins` means the root `pnpm-workspace.yaml` (local paths) wins
locally, so the author's install uses real on-disk paths; each consumer gets that
config-dependency's `base` with its own `.pnpm-config/<name>/` path. The repo's own
`bar` patch is never distributed and never disturbed.

## Guided reconcile (export)

Folded into `export` (the chosen tooling scope — declarative discovery plus a
guided sync step, not a wrapper around `pnpm patch`):

- list discovered patches grouped by **distributed / local-only**;
- flag **orphans**: a `patchedDependencies` entry with no `.patch` file, or an owned
  `.patch` file with no resulting entry;
- flag **key mismatches**: a filename that does not parse to the key it is
  registered under;
- normalize paths and write the local `pnpm-workspace.yaml` by merge.

The reconcile is informational; it does not wrap or drive `pnpm patch`.

## Non-goals

- **No collision warnings or errors.** When two owners (or an owner and a repo-own
  patch) register the same `pkg@version`, the engine stays silent — pnpm's single
  `patchedDependencies` map allows one winner, and inspecting the merged result is
  what the `preview` command is for. Surfacing conflicts is the user's
  responsibility, by design.
- **No file copying.** The bundler's `public/` → `dist/` copy is the only file
  movement; the plugin never moves or writes `.patch` files.
- **No `pnpm patch` wrapper.** The author drives patch authoring with stock pnpm.
- **No distributed `patchesDir`.** It stays unmanaged.

## Error handling

- An explicit `patchedDependencies` `<value>` entry (or a `localPatchesDir`-rooted
  declaration) pointing at a missing `.patch` file is a build-time `ConfigError`,
  mirroring pnpm's own `PATCH_FILE_NOT_FOUND`.
- A patch filename that cannot be parsed into a valid key under the `__` convention
  is a build-time `ConfigError` (the author can fall back to the explicit
  `<value>` form or fix the filename).
- The scoped-name on-disk `.pnpm-config/<name>/` layout (e.g. for `@example/savvy`)
  must be confirmed against a real consumer install before the path-templating is
  finalized — this is the one fact not yet verified from a live install and is
  called out as the first implementation task.

## Testing

- Table-driven discovery: folder fixtures → expected distributed + local maps.
- Key-derivation round-trip against pnpm's `__` convention (scoped, ranged, bare).
- Merge-preserves-siblings: `export` keeps unowned keys (other plugin + repo-own).
- `localPatchesDir` override: discovery from a non-standard root.
- `examples/savvy` + `examples/rolldown` e2e: two plugins plus a repo-own patch
  build and export, asserting each `base` path and the merged local
  `pnpm-workspace.yaml`.

## Affected code

- `package/src/define-plugin.ts` — `LocalDirective` strategy union, `local`
  object `localPatchesDir`, `patchedDependencies` input widening.
- New shared discovery/rewrite module (build + export both consume it).
- `package/src/plugin/` — wire discovery output into `freeze` input / `base`.
- `package/src/cli/` (`export`, local-merge) — merge-by-key reconcile and the
  guided sync output.
- Descriptors unchanged (`patchedDependencies` / `patchesDir` /
  `configDependencies` stay as they are).
- Docs: a user-facing "Distributing dependency patches" guide and an update to
  `export-cli.md` once implemented.
