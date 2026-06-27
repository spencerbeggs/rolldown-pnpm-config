# pnpm-workspace.yaml Export — Design

Date: 2026-06-27
Status: Approved (brainstorm); pending implementation plan
Branch: `feat/export` (built on the `upgrade` CLI from `feat/cli`)

## Goal

Add a `rolldown-pnpm-config export [path]` command that **materializes** the
plugin's managed config into the local `pnpm-workspace.yaml` — a static,
in-place write of the catalogs and pnpm settings the plugin would otherwise
inject at install time through its emitted pnpmfile.

## Motivation

`rolldown-pnpm-config` was extracted from `@savvy-web/pnpm-plugin-silk`, which
configures pnpm + catalogs across an agency's projects so updates distribute
effortlessly. Silk is part of a unified tooling monorepo (`savvy-web/systems`,
home of `@savvy-web/bundler`). Moving the silk plugin into that monorepo creates
a chicken-and-egg problem: **the monorepo cannot consume its own plugin as a
config dependency.** That is actually desirable — you want to develop and test
config changes against your own integrated tooling — but it means there is no
pnpmfile distributing the config to the monorepo root.

`export` closes that loop. You author the config once with `PnpmConfigPlugin`,
optionally `upgrade` its catalog versions, then `export` it into the monorepo's
`pnpm-workspace.yaml`. A `pnpm install` then exercises the exact catalogs and
ranges the published plugin will hand to every downstream consumer — so you can
verify peer/dependency ranges all play together before cutting a release.

## Design decisions (resolved during brainstorming)

1. **Merge model — plugin overwrites (structural materialization).** For every
   field the plugin manages, `export` overwrites the value in the local
   `pnpm-workspace.yaml`. There is **no** strategy merge and **no** enforcement
   (those belong to the install-time pnpmfile). Unknown / unsupported keys are
   preserved. The only escape hatch for local divergence is the `local` key.
2. **`workspaceYaml` descriptor flag.** Not every managed field is valid in
   `pnpm-workspace.yaml` (e.g. `confirmModulesPurge` is undocumented/config-only).
   Each of the 121 descriptor entries declares `workspaceYaml: boolean`,
   classified against pnpm's real `pnpm-workspace.yaml` schema, with a table
   test asserting completeness. `export` writes only `workspaceYaml: true` fields.
3. **Config loading — static evaluation, no execution.** Consistent with the
   `upgrade` command: oxc-parse the config module, statically evaluate the single
   `PnpmConfigPlugin({...})` argument literal into a plain object. No module
   execution, no dependency resolution, no side effects. A non-literal value
   (spread / variable / computed) is reported as an error telling the user to
   inline it.
4. **No version resolution.** Unlike `upgrade`, `export` never touches the
   registry — the ranges and peers are already set in source. `export` is purely
   structural.
5. **`local` key — export-only overlay.** `PnpmConfigPlugin`'s input gains an
   optional `local?: Partial<PluginConfig>`. It is ignored by the build / shipped
   pnpmfile (freeze iterates only managed fields). `export` shallow-overlays each
   field `local` sets over the base config **before** `freeze`, so e.g.
   `local.publicHoistPattern` fully replaces the generated one for the local
   export only.
6. **Catalog merge — by name, whole-catalog replace; local catalogs preserved.**
   For each catalog name the plugin defines (`silk`, `silkPeers`, …) the plugin's
   catalog replaces that name wholesale. Catalog names the plugin does not define
   (e.g. a local `tsdown` catalog used for in-monorepo packages not distributed
   by the plugin) are preserved untouched.
7. **YAML — parse → overlay → friendly-sort → stringify.** Matches the project's
   existing `savvy lint fmt pnpm-workspace` formatter (`yaml`'s `parse`/`stringify`
   with `{ indent: 2, lineWidth: 0, singleQuote: false }` + a key sort). Comments
   are not preserved — consistent with the repo's lint-staged `fmt` pass that
   already normalizes the file on commit. `rolldown-pnpm-config` stays standalone
   (does not depend on the monorepo-internal `@savvy-web/silk-effects`); the sort
   is local, and the project's `lint:fmt` reconciles any residual ordering.
8. **Never delete keys.** `export` only overwrites the keys the plugin actually
   declares (post-`local`). A managed field the plugin omits leaves any existing
   value in the YAML untouched; `export` deletes nothing.

## Data flow

```text
rolldown-pnpm-config export [path] [--preview]
  1. discover the config module in cwd (reuse upgrade's findConfigFiles /
     pickConfigCandidate; error on 0 or >1)
  2. evaluatePluginConfig(source) → plain config object (incl. `local`)
     (oxc static eval; non-literal value → error)
  3. apply `local` overlay over the base config (export-only)
  4. freeze(effectiveConfig) → base   (reuses the engine: validates + normalizes
                                        catalogs incl. <name>Peers, unwraps
                                        FieldInput; NO registry)
  5. keep only base fields whose descriptor is workspaceYaml:true
     (drops confirmModulesPurge and any other config-only field)
  6. resolve the target pnpm-workspace.yaml:
       - [path] if given (create if absent)
       - else walk up from cwd to the nearest pnpm-workspace.yaml
       - else create ./pnpm-workspace.yaml (no merge — fresh file)
  7. parse the target (if it exists) → overlayWorkspace(filteredBase, parsed):
       overwrite managed fields; catalogs by-name; preserve everything else;
       never delete
  8. renderWorkspace(merged) → friendly-sort + yaml.stringify
  9. --preview: log the rendered file (and a diff vs current), exit 0
     otherwise: write the target
```

`freeze` is reused unchanged, so `export` and the shipped pnpmfile derive the
same managed values from the same source. The only engine change is the
`workspaceYaml` descriptor flag (step 5) and the additive `local` input key
(step 3); everything else is new CLI code under `package/src/cli/`.

## Command surface

```text
rolldown-pnpm-config export [path] [--preview]
  path        the pnpm-workspace.yaml — source AND target. Optional.
              default: walk up from cwd to the nearest pnpm-workspace.yaml;
              if none exists, create ./pnpm-workspace.yaml
  --preview   compute and log the rendered file plus a diff vs the current
              content, write nothing, exit 0
```

The config module (`PnpmConfigPlugin({...})` source) is discovered separately
in cwd, reusing the `upgrade` command's discovery; the `[path]` argument refers
only to the `pnpm-workspace.yaml`.

## Components

All new CLI units live under `package/src/cli/`, following the existing
pure-unit-with-thin-shell style:

- `evaluate.ts` — `evaluatePluginConfig(source: string, filename: string): { config: Record<string, unknown> | null; errors: string[] }`.
  oxc-parse, locate the single `PnpmConfigPlugin(...)` call, statically evaluate
  its object-literal argument (strings / numbers / booleans / arrays / nested
  objects, incl. `local`) into a plain JS object. Non-literal values accumulate
  in `errors`; never throws.
- `workspace-overlay.ts` — `overlayWorkspace(managed: Record<string, unknown>, parsed: Record<string, unknown>): Record<string, unknown>`.
  Pure overlay: overwrite each managed top-level key; for `catalogs`, replace by
  catalog name and preserve unknown names; leave all other keys verbatim; delete
  nothing.
- `workspace-file.ts` — `findWorkspaceFile(startDir): string | null` (walk up),
  `parseWorkspace(source): Record<string, unknown>`, and
  `renderWorkspace(obj): string` (friendly key sort + `yaml.stringify` with the
  project's options).
- `local-overlay.ts` — `applyLocal(config, local): config` (shallow per-field
  replace), kept tiny and pure.
- `commands/export.ts` — the `@effect/cli` `export` command wiring the pipeline,
  with `[path]` arg and `--preview` flag.

Engine change:

- `package/src/descriptors/types.ts` — add `readonly workspaceYaml: boolean` to
  `FieldDescriptor`.
- `package/src/descriptors/*.ts` — set `workspaceYaml` on every entry.
- a descriptor table test — assert every field declares `workspaceYaml`.
- `package/src/define-plugin.ts` (or wherever `PluginConfig` lives) — add
  `local?: Partial<PluginConfig>` to the input type.

Reused from the `upgrade` CLI: `findConfigFiles` / `pickConfigCandidate`
(config-module discovery), the oxc parsing approach, `freeze` (the engine),
`@effect/cli` command structure.

## Testing

- **Pure units (fully tested):**
  - `evaluatePluginConfig`: literal config → object; `local` captured; a
    computed/spread value → an `errors` entry (no throw).
  - `overlayWorkspace`: managed field overwritten; `packages` /
    `configDependencies` / a local `tsdown` catalog preserved; a plugin catalog
    (`silk`) replaces by name; `local`-overridden field reflected; no key deleted.
  - `applyLocal`: per-field shallow replace.
  - `renderWorkspace`: friendly sort is deterministic and idempotent (re-render
    of rendered output is stable).
  - descriptor `workspaceYaml` completeness: every field declares it.
- **Integration (headless):** run the export core against a temp
  `pnpm-workspace.yaml` fixture — assert managed fields written, unknown keys
  preserved, `local` applied, catalogs by-name; the **create-new-file** path
  (no existing YAML → fresh file with only managed fields); and `--preview`
  writes nothing while logging the rendered output.
- Coverage: the CLI shell (command wiring, file IO) stays thin over the pure
  units, matching the `upgrade` coverage approach (lower the thresholds only if
  the shell genuinely breaches them).

## Out of scope

- Version resolution / registry access (that is the `upgrade` command's job).
- Strategy-merge or enforcement on export (install-time pnpmfile behavior only).
- Comment / formatting preservation in `pnpm-workspace.yaml` (the project's
  `lint:fmt` already normalizes the file).
- Materializing the `local` key into the shipped pnpmfile (it is export-only).

## Reference

- `savvy-web/systems/packages/cli/src/commands/lint/fmt.ts` — the canonical
  `pnpm-workspace.yaml` parse → sort → `yaml.stringify` formatter to mirror.
- The `upgrade` CLI (`package/src/cli/`) — discovery, oxc parsing, `freeze`
  reuse, `@effect/cli` patterns, and the coverage approach.
