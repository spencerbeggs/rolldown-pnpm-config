# Catalog Upgrade CLI — Design

Date: 2026-06-26
Status: Approved (brainstorm); pending implementation plan
Branch: `feat/cli`

## Goal

Give plugin authors an amazing DX for keeping catalog versions current. Run

```bash
rolldown-pnpm-config upgrade -i savvy.build.ts   # `up` is an alias
```

to walk through upgrading the catalog versions declared in a config file. The
command reads the file, resolves available versions from the registry, lets the
author choose per package, and **rewrites the version ranges in place** in the
source — keeping the versions visible in code, with no separate generated file
to reconcile.

This replaces the old `pnpm-plugin-silk` approach (track catalog deps in the
repo root `package.json`, run `pnpm up -i -r`, regenerate from the local file),
which required interplay between generated code and an on-disk manifest.

## Two phases

This is two coupled deliverables, sequenced. Phase B depends on Phase A's shape
being stable.

- **Phase A — API consolidation (prerequisite).** Collapse the three authoring
  entry points into one.
- **Phase B — the `upgrade` CLI.** Static-analysis find + registry resolve +
  interactive walk + surgical in-place rewrite.

---

## Phase A — API consolidation

### Motivation

Today there are three places to define plugin options: `defineCatalogs(...)`,
`definePlugin(...)`, and `PnpmConfigPlugin(...)`. That hurts DX and forces the
CLI to understand multiple shapes. Collapse to a single canonical, statically
analyzable call.

### Target shape

```ts
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

export const plugin = PnpmConfigPlugin({
  catalogs: {
    silk: {
      packages: {
        typescript: "^5.9.0",                                 // no peer entry derived
        vitest:     { range: "^4.0.0", peer: "lock-minor" },  // derived peer range
        effect:     { range: "^3.0.0", peer: "^3.0.0" },      // explicit/pinned peer range
      },
    },
  },
  overrides: { "tar@<6.2.1": ">=6.2.1" },
  publicHoistPattern: ["@types/*"],
  strictDepBuilds: true,
  // ...all existing PluginConfig fields, unchanged
});
```

### Changes

- `catalogs` moves from a `defineCatalogs(...)` return (`CatalogsResult`) to an
  inline record: `Record<string, { packages: Record<string, CatalogPackageSpec> }>`.
  It is keyed by catalog name (the old array's `name` field becomes the key).
- `CatalogPackageSpec` becomes:
  `string | { range: string; peer?: string; strategy?: "lock" | "lock-minor" }`.
  `peer` is the **materialized** peer range written in source; `strategy` is
  optional CLI-only metadata describing how to recompute `peer` on a `range`
  bump (see Peer model).
- `defineCatalogs` and `definePlugin` are **removed from the public API**. Their
  validation and the compile-time `PluginConfig` drift guard fold into
  `PnpmConfigPlugin`'s parameter type and internal pipeline. (Peer-catalog
  generation is now a verbatim read, not a derivation — see Peer model.)
- `define-catalogs.ts` / `define-plugin.ts` are deleted; the shared types
  (`CatalogPackageSpec`, `PluginConfig`, `FieldInput`) move to a types module
  and stay exported.
- The descriptor table, `strategies/`, freeze/serialize, the virtual `catalogs`
  export, and every managed field are unchanged. This is an entry-point
  refactor, not an engine rewrite.

### Peer model

`peers: true | false` is removed. Peer ranges are **materialized in source**, not
derived at build time — otherwise a `range` bump would silently change the peer
range with no diff, defeating the "visible in code" goal.

```ts
typescript: { range: "^5.9.0", peer: "^5.9.0", strategy: "lock-minor" }
```

- **`peer`** is the materialized peer range, written in source. It goes verbatim
  into the `<name>Peers` catalog.
- **`strategy`** (`"lock" | "lock-minor"`, optional) is **CLI-only** metadata: it
  tells the `upgrade` CLI how to recompute `peer` when `range` is bumped. The
  runtime ignores `strategy`.

Invariants:

- **The runtime never derives.** A `<name>Peers` catalog is generated iff a
  package carries a materialized `peer`, and contains **only** those packages,
  using each `peer` value verbatim.
- **`strategy` present, `peer` absent** → the runtime emits no peer entry for that
  package (it never invents a value). The CLI materializes `peer` on the next
  `upgrade` run.
- **Recomputation is the CLI's job.** On a `range` bump the CLI computes the new
  `peer` via `derivePeerRange(newRange, strategy)` and **rewrites the `peer`
  literal too**, so one upgrade yields two visible edits.

`derivePeerRange(range, strategy)` (CLI-only, semantics adopted from
`savvy-web/silk-update-action/src/services/peer-sync.ts`, built on `semver-effect`):

- **`"lock"`** → `${operator}${major}.${minor}.${patch}` — keep the operator, pin
  to the chosen version (e.g. `^6.5.1`).
- **`"lock-minor"`** (silk calls this `"minor"`) → `${operator}${major}.${minor}.0`
  — floor patch to `.0` (e.g. `^6.5.0`).

A `peer` with no `strategy` is a static pin: the CLI never auto-changes it (but
may offer a manual bump as its own line).

### Migration

- Update `examples/savvy`, `examples/rolldown`, and the parity harness to the
  consolidated shape.
- One changeset documenting the breaking authoring-API change. Nothing has
  shipped, so the break is acceptable.

---

## Phase B — the `upgrade` CLI

### Stack

Mirrors `vitest-agent/packages/cli` and `runtime-resolver`:

- `@effect/cli` + `@effect/platform-node` — command, args, services.
- **Ink** — interactive walk-through UI.
- **`oxc-parser`** — AST with byte-offset spans for surgical edits (on-brand for
  a rolldown-adjacent package).
- **`semver-effect`** — all version parsing/compare/satisfies/bump and peer
  derivation.
- **`pnpm view`** — registry queries (reuses the user's `.npmrc`, scoped
  registries, and auth tokens; private registries just work).

Bin name: `rolldown-pnpm-config`. Source under `package/src/cli/`.

### Pipeline (small single-purpose units)

```text
up.ts (Command)
  └─ discover.ts   read file → oxc parse → find the one PnpmConfigPlugin(...) call
  │                → CatalogEntry[] { catalog, pkg, currentRange, operator,
  │                  rangeSpan:[start,end],
  │                  peer?: { value, span:[start,end] },   // materialized peer literal
  │                  strategy?: "lock" | "lock-minor" }
  ├─ resolve.ts    Effect service: `pnpm view <pkg> versions --json`
  │                (deduped, parallel, bounded) → SemVer[]; filter prereleases
  ├─ plan.ts       per entry: latestInRange + latestOverall (semver-effect);
  │                if strategy, derivePeerRange(candidateRange, strategy) →
  │                Candidate[] (each carries its resulting peer rewrite)
  ├─ walk (Ink)    render per-package choice, collect Decision[]
  └─ rewrite.ts    apply chosen range AND recomputed peer at their spans,
                   right-to-left, atomic write
```

### Key properties

- **No execution of the config.** Discovery and rewrite are 100% static via oxc
  spans. There is exactly one canonical call shape (`PnpmConfigPlugin(...)`) and
  the catalog values are literals, so the earlier "execute for truth" step is
  unnecessary by construction.
- **Non-literal values are surfaced, never dropped.** If a version value is
  computed/spread/aliased rather than a string literal, that entry is reported as
  *skipped — manual* and excluded from the rewrite.
- **Operator preserved by construction.** Only the version digits inside the
  `range` literal change; the `^`/`~`/exact prefix is reused. Complex
  multi-comparator ranges (`>=5 <6`) are flagged as skips rather than mangled.
- **Idempotent / re-runnable.** A package already at the latest available version
  renders as `up to date` and is not offered.

### Version candidate model

For each package with current range (e.g. `^5.9.0`):

- **latest-in-range** — highest published version satisfying the current range
  (e.g. `^5.9.3`).
- **latest-overall** — highest published stable version (e.g. `^7.1.0`), which
  may be a major jump.
- **keep** — leave the range untouched.

Prereleases/tags are filtered out by default.

### Command surface

```text
rolldown-pnpm-config upgrade [file] [flags]   (alias: up)
  file              config file to update (default: autodetect in cwd — a *.ts
                    exporting/containing a PnpmConfigPlugin(...) call;
                    error if 0 or >1 candidates)
  -i, --interactive walk each package (DEFAULT)
  -y, --yes         non-interactive: apply latest-IN-RANGE to all
      --dry-run     print the diff, write nothing
      --catalog <n> limit to a single catalog by name
```

**Major bumps are interactive-only.** Non-interactive mode (`-y/--yes`) resolves
within range only (`^5.9.0 → ^5.9.3`) and never offers or applies the
latest-overall/major line. To cross a major, the author must run interactively
and choose it. There is deliberately no flag that applies a major automatically.

### Interactive walk (Ink), one package at a time

```text
silk › typescript   current ^5.9.0
  ❯ ^5.9.3   in-range   (latest satisfying ^5.9.0)
    ^7.1.0   latest     ⚠ major
    keep ^5.9.0
```

```text
silk › vitest   current ^4.0.0   peer ^4.0.0   strategy: lock-minor
  ❯ ^4.0.3   in-range
    ^4.2.0   latest
    keep ^4.0.0
  ↳ peer → ^4.2.0   (will rewrite the `peer` literal too, via strategy lock-minor)
```

- Packages already at latest render dimmed as `up to date` and are auto-skipped.
- A package with `peer` but no `strategy` shows the pinned peer range as
  read-only context, with a follow-up line offering to bump it independently.
- **Drift detection:** if a package's materialized `peer` no longer matches what
  `strategy` would produce from the *current* `range` (e.g. a hand-edited
  `range`), the walk surfaces a resync line — a visible peer-only edit — even
  when the range itself is up to date.
- A package with `strategy` but no `peer` yet → the chosen candidate's peer is
  **materialized** (a new `peer` literal is inserted into the object).
- Footer tally: `3 to update · 1 major · 2 up to date`.

### Safety / output

- A final **confirmation summary** before any write (even in interactive mode),
  showing every range change and every derived peer change as a diff.
- `--dry-run` prints that same diff and exits 0.
- **Atomic write**, single file. Edits applied right-to-left so spans stay valid.
  Formatting preserved by surgical edits; no reformat pass needed.
- Exit codes: `0` on applied/no-op, non-zero on parse failure or registry error.
  Skipped entries (non-literal / complex range) are reported but do not fail the
  run.

### Out of scope for v1 (YAGNI)

- Multiple input files in one run.
- Workspace `package.json` / dependency updates (that is `silk-update-action`'s
  job).
- Lockfile or install side effects.
- Subcommands other than `upgrade`. The `resolve`/`plan` units are reusable, so
  the architecture leaves room, but v1 ships `upgrade` only.

---

## Reference code

- `savvy-web/silk-update-action/src/services/peer-sync.ts` — `computePeerRange`
  lock/minor semantics, adopted verbatim.
- `semver-effect` — version math, range algebra, peer derivation primitives.
- `runtime-resolver` — Effect CLI + registry-resolution pattern with offline
  fallback; structural reference for `resolve.ts`.
- `vitest-agent/packages/cli` — `@effect/cli` + Ink CLI structure to mirror.
