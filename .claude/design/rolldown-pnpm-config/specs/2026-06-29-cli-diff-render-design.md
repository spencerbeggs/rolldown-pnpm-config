# Shared CLI diff/render system (export + upgrade) — Design

Date: 2026-06-29
Status: Approved (brainstorm); pending implementation plan
Branch: `feat/ui-updates`
Area: `package/src/cli/` (export + upgrade commands, shared UI)

## Problem

Two CLI commands present "what would change" to the author, but neither does it
well:

- `export --preview` prints the canonical `pnpm-workspace.yaml` as plain YAML.
  No diff, no color — you can't see what would change about the file on disk.
- `upgrade`'s `renderSummary` already *is* a diff in spirit
  (`catalog › pkg  ^19.0.0 → ^19.2.0`, nested peer changes, "new peer"
  additions, conflicts, a tally) but it is plain uncolored text.

We want one shared render system so both commands speak the same visual
language: colored, gutter-marked, pipe/CI-safe. `export` diffs a data structure
(the YAML); `upgrade` diffs a decision set (catalog version ranges). The diff
*models* differ per command; the *render primitives* are shared.

## Decisions (from brainstorming)

1. **Static now, interactive later.** Ship one-shot, pipe/CI-friendly colored
   renders that exit. The reusable core is the render primitives (`StyledLine`,
   palette, `toAnsi`); a future Ink shell maps the same `StyledLine[]` to
   `<Text>`.
2. **export:** default to **changes + context**, `--full` shows the whole
   canonical tree. Inline scalars (`before → new`), block structures for whole
   add/remove.
3. **Arrays sorted lexicographically and set-diffed**, as part of canonical
   format (write path too) so preview matches the written file.
4. **upgrade:** thread the shared palette through `renderSummary` AND the
   interactive `Walk` candidate rows; add a new `upgrade --preview` that renders
   the planned range diff non-interactively.
5. **`--full`** has one coherent meaning per command: `export` → whole tree vs
   changes+context; `upgrade` → include up-to-date packages vs changes-only.
6. **Robustness fold-in:** the shared render path is non-TTY/pipe safe, and the
   interactive walk falls back to a non-interactive render instead of hanging
   when stdin is not an interactive TTY (raw mode unsupported). The root-cause
   investigation of the reported `upgrade` hang is a **separate** debugging task
   (systematic-debugging), not designed here.
7. **Standard env detection, not hand-rolled.** Capability detection (color,
   interactivity, hyperlinks) is centralized in one `ui/env.ts` wrapper over
   `std-env` and `std-osc8` — the same approach used in `vitest-agent`. Render
   functions stay pure and receive capability flags as parameters.

## Shared render primitives

Live in `package/src/cli/ui/` and are imported by both commands.

```ts
// ui/styled.ts
type ChangeStyle = "added" | "removed" | "changed" | "unchanged"
  | "warn" | "local" | "unmanaged";
interface Segment { text: string; style: ChangeStyle | "plain"; }
interface StyledLine {
  indent: number;
  gutter: "+" | "~" | "-" | " " | "·" | "░" | "⚠";
  segments: Segment[];
  tag?: "local" | "unmanaged";
}
```

Palette / gutter scheme (single source of truth):

| meaning | gutter | color |
| --- | --- | --- |
| added | `+` | green |
| changed | `~` | yellow |
| removed | `-` | red |
| unchanged | ` ` | dim / default |
| local (tag) | `·` | magenta |
| unmanaged | `░` | dim |
| conflict/warn | `⚠` | red |

```ts
// ui/ansi.ts
function toAnsi(lines: StyledLine[], opts: { color: boolean }): string;
```

- Gutters and tags are **always present**, so output is meaningful with color
  off (colorblind-safe, pipe-safe). A one-line legend footer is appended by the
  command.
- A tiny internal color helper applies/omits ANSI codes — no color dependency,
  static path stays Ink-free.
- `toAnsi` and all render functions (`renderExportDiff`, `renderSummary`) take
  capability flags as parameters and never read the environment themselves.
  Detection happens once at the command edge (see below) and flags are threaded
  in. This keeps the render layer pure and unit-testable without env mocking.
- The future Ink `<DiffView>` (phase 2) maps `StyledLine[]` → `Box`/`Text`.

## Terminal capability detection

Do not roll our own color/TTY logic. One shared wrapper centralizes detection
on top of two zero/light-dependency packages already used this way in
`vitest-agent`:

- [`std-env`](https://www.npmjs.com/package/std-env) — `isColorSupported`
  (handles `NO_COLOR`/`FORCE_COLOR`/TTY/CI), `hasTTY`, `isCI`, `isAgent`.
- [`std-osc8`](https://www.npmjs.com/package/std-osc8) — `link(label, url)` with
  automatic graceful fallback, `supportsHyperlinks`, `supportsHyperlinksFor`.
  Already handles `NO_COLOR`, tmux/screen, CI, and piped-stdout fallback.

```ts
// ui/env.ts  (the ONLY module that imports std-env / std-osc8)
import { isColorSupported, hasTTY, isCI, isAgent } from "std-env";
import { link, supportsHyperlinks } from "std-osc8";

interface Capabilities {
  readonly color: boolean;        // isColorSupported
  readonly interactive: boolean;  // hasTTY && !isCI && !isAgent
  readonly hyperlinks: boolean;   // supportsHyperlinks
}
function detectCapabilities(): Capabilities;
// re-export link for callers that want a hyperlink with built-in fallback
export { link, supportsHyperlinks };
```

- `color` replaces the old `shouldColor()`; passed into `toAnsi`.
- `interactive` decides whether `upgrade` enters the Walk or falls back to a
  non-interactive render (see Robustness).
- Hyperlinks (optional polish, gated on `hyperlinks`): the preview header file
  path links via a `file://` URL; in `upgrade`, package names link to their npm
  page. To avoid the `label (url)` fallback noise on many lines, per-package
  links are emitted only when `supportsHyperlinks` is true — plain text
  otherwise. The single header link may use `link()` directly (its fallback is
  one line).
- New runtime dependencies on `package/package.json`: `std-env` (`^4.1.0`) and
  `std-osc8` (latest published — already on npm). Both ESM-only, tiny. `std-osc8`
  is wired into `ui/env.ts` now as an available CLI helper even though the
  hyperlink usage is minimal at first; the resilience win is `std-env`.

## export: data-structure diff

### Canonicalization

Both sides are canonicalized before comparison so reordering is invisible:

- `before` = parsed existing file (`parseWorkspace`) → canonicalizer.
- `after` = `merged` (`overlayWorkspace` output) → canonicalizer.

`renderWorkspace`'s `sortKeys` (`package/src/cli/workspace-file.ts`) is extended:

- Object keys: alpha-sorted (unchanged behavior).
- **Arrays whose elements are all primitives** (string/number/boolean): sorted
  lexicographically. Arrays containing objects/arrays keep their order.
- Applies **only** to the workspace renderer, not the pnpmfile virtual-module
  serializer (`package/src/plugin/serialize.ts`).
- Write-path effect: written `pnpm-workspace.yaml` arrays become lexicographic.
  Order only — never content.

### Diff model

```ts
// diff/types.ts
type ChangeKind = "added" | "removed" | "changed" | "unchanged";
type DiffTag = "local" | "unmanaged";
interface DiffNode {
  key: string; path: string[]; kind: ChangeKind; tag?: DiffTag;
  before?: unknown; after?: unknown;     // leaves
  children?: DiffNode[];                  // branches
}
```

`buildDiff(before, after, meta): DiffNode` where
`meta = { localKeys: ReadonlySet<string>; managedKeys: ReadonlySet<string> }`.

- `localKeys` = `Object.keys(config.local ?? {})`.
- `managedKeys` = `WORKSPACE_FIELDS` (descriptors with `workspaceYaml: true`).
  A top-level key in the file but not in `managedKeys` → `tag: "unmanaged"`.

Classification:

- added / removed / changed / unchanged by key-union at each object level.
- A wholly added/removed object or array becomes a branch whose descendants are
  all `added`/`removed` → renders as one colored block.
- `tag: "local"` — key ∈ `localKeys`; orthogonal, combines with any kind.
- `tag: "unmanaged"` — top-level key ∉ `managedKeys`; always `unchanged`
  content, just flagged (e.g. `packages`).
- arrays sorted then set-diffed: each element `added` / `removed` / `unchanged`.

`renderExportDiff(node, { full }): StyledLine[]` (in `diff/render.ts`) flattens
the tree. Default emits changed lines plus a small fixed count (2) of context
lines around each change, collapsing remaining unchanged runs to a dim
`… N unchanged`. `--full` emits every line. Changed scalar → inline
`before → new`; added/removed structure → colored block.

## upgrade: decision diff

`renderSummary` (`package/src/cli/summary.ts`) changes its return type from
`string` to `StyledLine[]`, keeping identical content/structure:

- changed range → `~` yellow, `catalog › pkg  before → new`.
- new peer → `+` green; peer change → `~`; resync/materialize keep their labels.
- interop adjustment (`↓`) → `~`; conflict (`⚠`) → red `⚠` gutter.
- tally line → dim footer.
- `--full` (upgrade) includes `up to date` packages as `unchanged` lines;
  default omits them (current behavior shows only changes + tally).

Call sites run `toAnsi(renderSummary(...), { color: shouldColor() })`. This
colorizes both the post-walk summary and `--dry-run`.

The interactive `Walk` (`ui/Walk.ts`) candidate rows adopt the shared palette:
selection highlight and the `⚠ major` marker use the same `ChangeStyle` tokens
instead of ad-hoc `color: "cyan"`.

### `upgrade --preview`

New boolean option. Non-interactive projection:
discover → resolve → plan → take default picks (latest-in-range, never major,
like `--yes`) → `renderSummary` → `toAnsi` → stdout → exit. No walk, no write.
Mirrors `export --preview` semantics. Respects `--full`.

Distinct from `--dry-run`: `--dry-run` runs the normal flow (interactive walk
unless `--yes`) then prints the summary without writing; `--preview` never
prompts.

## Robustness (hang mitigation)

The upgrade command guards on `capabilities.interactive` (from `ui/env.ts`,
i.e. `hasTTY && !isCI && !isAgent`): when not interactive, skip the interactive
`Walk` and render the non-interactive projection (same as `--preview`) instead
of calling `render()` and awaiting `waitUntilExit()` forever. This converts the
reported hang into useful output in non-TTY / CI / agent contexts. The
root-cause hang investigation (e.g. why it may hang even on a real TTY) is
tracked separately.

## Module layout

Shared (`package/src/cli/ui/`):

- `styled.ts` — `StyledLine`, `Segment`, `ChangeStyle`, gutter/palette tokens.
- `ansi.ts` — `toAnsi(lines, { color })` + color helper (pure, no env reads).
- `env.ts` — `detectCapabilities()`, re-export `link`; the only module importing
  `std-env` / `std-osc8`.
- (later) `DiffView` Ink component — phase 2.

export (`package/src/cli/diff/`):

- `types.ts` — `DiffNode`, `ChangeKind`, `DiffTag`.
- `build.ts` — `buildDiff(before, after, meta)`.
- `render.ts` — `renderExportDiff(node, { full })`.

Changed existing files:

- `workspace-file.ts` — `sortKeys` sorts primitive arrays.
- `summary.ts` — `renderSummary` returns `StyledLine[]`.
- `ui/Walk.ts` — candidate rows use shared palette.
- `ui/run-walk.ts` — non-TTY guard / static fallback.
- `commands/export.ts` — `--full` option; preview returns + renders the diff.
- `commands/upgrade.ts` — `--preview` and `--full` options; preview projection;
  colorized summary; non-TTY fallback wiring.

## Testing

- `buildDiff` units: each category; nested catalogs; whole-block add/remove;
  array set add/remove after sort; `local` + `unmanaged` tags;
  canonical-reorder-is-invisible.
- `renderExportDiff` units: indentation, gutters, inline-vs-block, tags,
  context-collapse vs `--full`. Pure (capability flags passed in).
- `toAnsi` units: color on/off parity (same gutters/text, ANSI present/absent).
- `ui/env.ts` is a thin edge wrapper over `std-env`/`std-osc8` and is not
  unit-tested directly; its outputs are injected into the pure render functions,
  which are tested with explicit flags.
- `sortKeys` unit: primitive arrays sorted, object-containing arrays preserved.
- `renderSummary` units: returns expected `StyledLine[]` for changed / new peer /
  resync / materialize / interop / conflict / `--full` up-to-date.
- Integration: `export --preview` against a fixture with reordered keys,
  unmanaged `packages`, and a local override; `upgrade --preview` projection
  against a fixture config; non-TTY fallback produces output instead of hanging.

## Out of scope

- Interactive Ink diff shell (navigate / collapse / write) — phase 2, reuses
  `StyledLine[]`.
- Root-cause fix of the `upgrade` hang — separate systematic-debugging task
  (this spec only adds the non-TTY fallback).
- Sorting arrays in the pnpmfile virtual-module serializer.
