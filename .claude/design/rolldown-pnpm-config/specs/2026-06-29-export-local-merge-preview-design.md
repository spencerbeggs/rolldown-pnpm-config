# export/preview split, local merge semantics & override preservation — Design

Date: 2026-06-29
Status: Approved (brainstorm); pending implementation plan
Branch: `feat/ui-updates`
Area: `package/src/cli/` (export + new preview command, local overlay) and `package/src/define-plugin.ts` (authoring type)
Builds on: `2026-06-29-cli-diff-render-design.md` (shared StyledLine/toAnsi/diff render layer)

## Problem

Dogfooding `export --preview` against a real consumer (`savvy-web/systems`) surfaced one
bug and three desired changes:

1. **Data loss (release blocker).** `overrides` and `publicHoistPattern` are managed
   top-level fields, so `overlayWorkspace` replaces them wholesale. An existing
   `overrides` entry like `rolldown-pnpm-config: file:/…/pkg` (a local pnpm link) is
   silently dropped on write. The preview correctly shows it as `- removed`; the
   behavior is wrong.
2. **One command, two jobs.** `export --preview` conflates "write the file" and "show
   what would change." Split into `export` (write; `--dry-run` to show) and a dedicated
   interactive `preview`.
3. **One static view, a flag for verbosity.** Replace the `--full` flag in the
   interactive case with `ink-tab` tabs, and add a third "simulated" view.
4. **Local divergence is replace-only.** `local.<field>` can only replace a field. Authors
   need to add (union) or subtract (difference) entries locally, and to preserve
   protocol-prefixed entries already in the file.

## Decisions (from brainstorming)

- Design all of this as one coherent system (data-loss fix is a default of the local
  system).
- `local.<field>` for mergeable fields is an object directive `{ preserve?, value?,
  strategy? }`, all optional; bare values still accepted as overwrite sugar.
- Default override preservation protocols: `file:` `link:` `workspace:` `portal:` (on by
  default); `git*` opt-in via `preserve`. Match = override **value** starts with
  `<protocol>:`.
- `export` applies the existing `excludeByRepo` refine to `publicHoistPattern`
  automatically.
- `local` stays **export-time only**; the runtime pnpmfile keeps using the shared
  (non-local) config.
- `preserve` is **overrides-only**; arrays use `strategy`/`excludeByRepo`.

## Command surface

`package/src/cli/bin.ts` registers three subcommands (`upgrade`, `export`, `preview`).

- `rolldown-pnpm-config export [path]` — writes `pnpm-workspace.yaml`; prints
  `Exported to <path>`.
- `rolldown-pnpm-config export [path] --dry-run [--full]` — prints the static colored
  diff (Changes by default, whole canonical tree with `--full`); writes nothing.
  Replaces the removed `export --preview` flag.
- `rolldown-pnpm-config preview [path]` — interactive `ink-tab` explorer. When
  `!detectCapabilities().interactive` (non-TTY/CI/agent), prints the static **Changes**
  diff and exits — never hangs.

All three reuse `buildDiff` / `renderExportDiff` / `toAnsi` from the shared render layer.

## Local directive semantics (authoring API)

New type in `package/src/define-plugin.ts`:

```ts
/** Per-field local merge directive (export-time only). @public */
export interface LocalDirective<T> {
  readonly preserve?: readonly string[]; // overrides only: protocol names (no trailing ":")
  readonly value?: T;
  readonly strategy?: "union" | "difference";
}
```

`PluginConfig.local` widens so a mergeable field may be its raw type **or** a
`LocalDirective` of that type:

```ts
readonly local?: {
  readonly [K in keyof PluginConfig]?: PluginConfig[K] | LocalDirective<PluginConfig[K]>;
};
```

Semantics, per field, computed at export time against `(managed, parsed)`:

- **Detection:** a directive is an object with at least one of `preserve` / `value` /
  `strategy`. For `overrides` (itself a record) and `publicHoistPattern` (array), the
  directive object is recognized by those reserved keys; a bare array/record is treated as
  `{ value }`. Scalar fields are always plain replace.
- `value` only → overwrite managed value with `value`.
- `strategy: "union"`:
  - record (`overrides`): `{ ...managed, ...value }` (value wins on key clash).
  - array (`publicHoistPattern`): set-union, then re-canonicalized (sorted) downstream.
- `strategy: "difference"`:
  - record: delete every key in `value` from managed.
  - array: remove every element in `value` from managed.
- `preserve` (overrides only): after the above, copy back any entry **from `parsed.overrides`**
  whose value string starts with `<proto>:` for `proto ∈ preserve`. Defaults to
  `["file", "link", "workspace", "portal"]` when `local.overrides` is absent OR present
  without a `preserve` key; an explicit `preserve` replaces the default list.

`local` is applied **post-freeze, export-time only**; it does not affect `freeze`'s `base`
or the runtime pnpmfile.

## Override preservation (data-loss fix)

The default-on `preserve` for `overrides` means a bare `export` (no `local` config) keeps
existing `file:`/`link:`/`workspace:`/`portal:` override entries. This is what stops the
local link from being deleted. Implemented as a special case of the directive engine: when
`local.overrides` is absent, the export still runs the preserve step with the default
protocol list (value/strategy steps are no-ops, leaving managed overrides intact, then the
local-protocol entries are copied back from `parsed`).

## excludeByRepo at export

`export` resolves the consuming repo with `resolveRootName` (reads cwd `package.json` /
pnpm root manifest) and applies the existing runtime `excludeByRepo(merged, ctx, byRepo)`
to `publicHoistPattern`, using the `byRepo` map from that field's manifest entry options.
Reuse the runtime functions verbatim (`package/src/runtime/ctx.ts`); do not reimplement.
Applied to `managed.publicHoistPattern` before the local directive step, so both the
written file and every preview view reflect it. If the repo cannot be resolved, the refine
is a no-op (unchanged list).

**Open item for planning — byRepo map source.** The runtime reads
`entry.options?.excludeByRepo as Record<string, string[]>`, but the descriptor
(`resolution.ts`) currently carries `options: { excludeByRepo: true }` (a boolean flag, not
the map). Planning MUST resolve where the real repo→packages map is authored (descriptor
option populated with the map, or supplied via config) before this feature can drop
`@savvy-web/cli`/`@savvy-web/mcp`. If the map is a placeholder today, auto-`excludeByRepo`
reduces to a no-op and `local.publicHoistPattern` with `strategy: "difference"` remains the
explicit fallback. This does not block the rest of the design; the `difference` directive
covers the same need manually.

## Export pipeline (restructured `runExport`)

1. evaluate config (incl. `config.local`); `freeze(config)` → `base` (shared, no local).
2. filter to `WORKSPACE_FIELDS` → `managed`.
3. `excludeByRepo` → `managed.publicHoistPattern`.
4. for each mergeable field present in `config.local` (and `overrides` always, for default
   preserve): `effective[field] = applyLocalDirective(managed[field], directive, parsed[field], field)`.
   Scalar `local` fields replace `managed[field]` directly.
5. `overlayWorkspace(effective, parsed)` → `merged`.
6. render/write (write path) or return diff trees (preview/dry-run).

`applyLocal` (the old pre-freeze shallow replace) is removed; its scalar-replace
responsibility moves into step 4.

## Preview views (data)

`runExport` (preview mode) returns the data needed to build all three trees, or a
dedicated `buildPreviewViews(...)` returns `{ changes, full, simulated }` as
`StyledLine[]` triples. Trees:

- **Changes / Full**: `buildDiff(canonicalize(parsed), canonicalize(merged), meta)`,
  rendered with `{ full: false }` and `{ full: true }`. `meta.localKeys` =
  `Object.keys(config.local ?? {})`; `meta.managedKeys = WORKSPACE_FIELDS`.
- **Simulated**: `vanilla` = managed base + excludeByRepo, **no local, not overlaid onto
  parsed**. `buildDiff(canonicalize(parsed), canonicalize(vanilla), meta)` rendered
  `{ full: false }`. Unmanaged keys in `parsed` (e.g. `packages`) and local-only override
  entries therefore render as `removed` — "unique to your repo."

## ink-tab UI + run bridge

- New dependency: `ink-tab`.
- `package/src/cli/ui/Preview.ts` — Ink component: a `Tabs` bar (`ink-tab`) over the three
  pre-built `StyledLine[]` views; renders the active view's lines as colored `Text`
  (mapping `StyledLine` → `Box`/`Text`, the phase-2 consumer of the shared contract). Tab
  switch is local state; `q`/Esc exits.
- `package/src/cli/ui/run-preview.ts` — `runPreview(views): Effect<void>` mirroring
  `run-walk` (render + `waitUntilExit`).
- `preview` command: detect capabilities; if interactive, `runPreview`; else print the
  Changes view via `toAnsi(views.changes, { color })`.

## Module layout

New:

- `package/src/cli/local-merge.ts` — `applyLocalDirective(managed, directive, parsed, field): unknown`
  and `isLocalDirective(v): boolean` (pure).
- `package/src/cli/effective.ts` — `effectiveManaged(managed, config, parsed, ctxRoot): Record<string, unknown>`
  (composes excludeByRepo + per-field local-merge) and `vanillaManaged(managed, ctxRoot)`.
- `package/src/cli/ui/Preview.ts`, `package/src/cli/ui/run-preview.ts`.
- `package/src/cli/commands/preview.ts`.

Modified:

- `package/src/define-plugin.ts` — `LocalDirective` type + widened `local`.
- `package/src/cli/commands/export.ts` — pipeline restructure; `--dry-run` replaces
  `--preview`; remove the inline `applyLocal` use.
- `package/src/cli/bin.ts` — register `preview`.
- `package/src/cli/local-overlay.ts` — removed (logic moves to `local-merge`/`effective`),
  or repurposed; callers updated.
- `package/package.json` — add `ink-tab`.

## Testing

- `local-merge` units: overwrite (value only); union/difference for records and arrays;
  preserve default list and explicit list; preserve matches value-prefix only; directive
  detection vs bare value; absent `local.overrides` still preserves `file:` entry.
- `effective` units: excludeByRepo drops repo-assigned packages; no-op when repo
  unresolved; composition order (excludeByRepo before local difference).
- view-builder units: simulated shows unmanaged + local-only as removed; changes/full
  honor local + preserve + excludeByRepo.
- integration: `export` preserves a `file:` override and applies excludeByRepo (writes
  correct file); `export --dry-run` prints the diff and writes nothing; `preview` non-TTY
  fallback prints the Changes view and exits (no hang).
- `ink-testing-library`: Preview renders the tab bar and switches active view.
- type test (`*.test-d.ts`): `local.overrides` accepts both a raw record and a
  `LocalDirective`.

## Out of scope

- Runtime pnpmfile honoring `local` (stays shared-config).
- `preserve` for non-record fields.
- Interactive write-from-preview (preview is read-only; use `export`).
- The root-cause `upgrade` TTY hang (separate debugging task).
