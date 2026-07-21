---
status: draft
module: rolldown-pnpm-config
category: spec
created: 2026-07-20
related:
  - ../architecture.md
  - ../export-cli.md
---

# Peer catalog colon naming + preview color legend

Two independent features on `feat/peer-with-colon`.

## Feature 1 — dual-emit peer catalogs

**Goal.** Peer catalogs are currently materialized as `<name>Peers` (camelCase).
npm/pnpm catalog names are arbitrary strings, so a `<name>:peers` form is
preferred. This branch emits **both** names (same peers map); the camelCase form
is removed in a later branch.

**Change.** `package/src/catalogs.ts` `normalizeCatalogs`: when a catalog has a
non-empty peers map, emit `out[`${name}Peers`] = peers` **and**
`out[`${name}:peers`] = peers`.

**Why it's safe / localized.** `<name>Peers` is emitted in exactly one place and
never read back — `freeze`, `serialize` (`JSON.stringify` keys, colon-safe) and
the runtime `catalogs` strategy treat catalog names as opaque strings; the
`upgrade` CLI reads the source `peer:` field, not the derived name. Catalog names
have no character-level validation, so a colon is accepted.

**Tests.** Add `silk:peers` assertions (bracket access — not a valid identifier)
alongside the existing `silkPeers` ones in `normalize-catalogs.test.ts`,
`freeze.test.ts`, `plugin.test.ts`, and `examples/savvy/__test__/build.e2e.test.ts`.
Both keys must exist this branch. Update the `catalogs.ts` docstring. Design-doc
prose about `<name>Peers` stays until the camelCase-removal branch.

## Feature 2 — distinguish unmanaged lines + color legend

**Problem.** In the diff/render layer, `unchanged` and `unmanaged` are distinct
`ChangeStyle` values but `render.ts` only maps `ChangeKind → ChangeStyle`, so an
unmanaged line is drawn with the `unchanged` style and differs only by its
`(unmanaged)` tag. Both palettes also give the two styles the same value.

**Changes.**

1. **Reach the `unmanaged` style.** `cli/diff/render.ts` `flatten`: when a node's
   `tag === "unmanaged"` and `kind === "unchanged"`, use the `unmanaged`
   `ChangeStyle`, and propagate that to descendants (thread a flag through
   `flatten`) so the whole passthrough block (`packages:` + its entries) reads as
   one shade. Simulated view keeps `removed`/red — there "unmanaged" means "would
   disappear", which the red already conveys.
2. **Palette A3.** `unchanged` stays theme-adaptive dim; `unmanaged` becomes a
   fixed gray.
   - `cli/ui/styled.ts` `ANSI_OPEN.unmanaged` → `\x1b[38;5;240m` (was `\x1b[2m`);
     `unchanged` stays `\x1b[2m`.
   - `cli/ui/Preview.ts` Ink props: `unchanged` → `{ dimColor: true }` (was
     `color: "gray"`); `unmanaged` → `{ color: "#585858" }`. (renderLines switches
     from a color-name map to a Text-props map so `dimColor` is expressible.)
3. **Drop the redundant `(unmanaged)` tag when color is on.** `tagSuffix` gains a
   `color` param: `unmanaged` renders `""` with color on (the gray shade + legend
   convey it) but keeps `(unmanaged)` with color off, where the shade is invisible
   and the tag is the only signal — preserving the styled.ts "tags stay meaningful
   without color" contract. `(local)` is kept in both (not in the legend). The Ink
   `Preview` (always colored) renders only `(local)`.
4. **Legend.** New shared `cli/ui/legend.ts` → `legendLines(): StyledLine[]`
   producing one line, `Legend:  ■ added  ■ removed  ■ modified  ■ unchanged  ■ unmanaged`,
   each swatch carrying the matching `ChangeStyle` so it tracks the palette
   automatically. Prepended (legend + blank spacer) only when `color === true`:
   - `preview` interactive (Ink, above the tabs) and its non-interactive fallback,
   - `export --dry-run`,
   - `upgrade --preview/--full`.

**Tests.** Extend `ui-ansi` / `diff-render` / `preview-ui` for the reachable
`unmanaged` style and the legend; update any exact-output assertions in the
export/upgrade preview tests for the prepended legend (color-on paths only).

## Feature 3 — preview interaction + Simulated view redesign

**Enter also exits.** `Preview.ts` `useInput` adds `key.return` alongside `q`/Esc.

**Simulated view is no longer a diff.** It previously ran `buildDiff(parsed →
vanilla)`, which rendered every local-only/unmanaged key as a confusing red
"removed" line even though nothing is actually removed. It now renders the
calculated fresh-consumer config directly as a plain pnpm-workspace.yaml listing
via new `cli/simulated-view.ts` `renderSimulated(vanilla, manifest)` — no `+/-/~`
gutters, `plain` style — with each top-level field annotated by how the plugin
combines it and how it is enforced:

- strategy → verb: `merge` (catalogs, mapChildWins, arrayUnion, arrayRecordUnion,
  overrides, peerDependencyRules, allowBuilds) or `overwrite` (scalar,
  securityFlag, securityMin). New `merge` (cyan) / `overwrite` (magenta)
  `ChangeStyle` values added to both palettes. (securityMin is really a floor;
  labeled `overwrite` to stay within the user's merge/overwrite vocabulary.)
- enforcement → suffix: `· warn` (yellow) / `· error` (red); `absent` = none.

**Separate legend for Simulated.** `legend.ts` gains `simulatedLegendLines()`
(`■ merge  ■ overwrite  ■ warn  ■ error`). The interactive `Preview` swaps
legends by active tab (diff legend for Changes/Full, simulated legend for
Simulated) and now renders the legend below the tab bar. The non-interactive
fallback and `export --dry-run` show only the diff and keep the diff legend.

## Out of scope

- Removing the camelCase peer name (future branch).
- Full-width inverse/banding for unmanaged (Option B rejected — text-width only).
- Design-doc prose sync for the peer rename (future branch).
