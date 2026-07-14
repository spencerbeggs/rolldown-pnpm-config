# Upgrade Table UI and Prerelease-Safe Peers — Design

Date: 2026-07-14
Status: Approved (brainstorm); pending implementation plan
Branch: `feat/upgrade-table-ui`

## Goal

Two changes to the `rolldown-pnpm-config upgrade` command, shipped on one branch.

1. **Fix a correctness bug** that silently rewrites a prerelease peer range to a
   version that was never published. A catalog entry pinned to
   `^3.0.0-next.8` with `strategy: "lock"` has its `peer` rewritten to `^3.0.0`
   — even when the author explicitly chooses *keep*.
2. **Replace the one-package-at-a-time interactive walk** with a single table
   showing every package at once, each row a radio group with the current value
   preselected, modelled on `pnpm up -i`. The post-selection confirmation
   summary mirrors the same table, colored to show what changed.

## Part 1 — The peer bug

### Root cause

`derivePeerRange` (`package/src/cli/peer-range.ts:35-37`) does not preserve the
version it was given; it reconstructs one from parsed components:

```ts
return strategy === "lock"
    ? `${prefix}${parsed.major}.${parsed.minor}.${parsed.patch}`   // ^3.0.0-next.8 → ^3.0.0
    : `${prefix}${parsed.major}.${parsed.minor}.0`;
```

The prerelease identifiers are dropped on the floor. The existing doc comment
acknowledges this ("expects a release version; a prerelease tag would be
dropped") but nothing enforces the precondition.

Three defects follow from that one line:

1. **The derived peer is unpublished.** `^3.0.0` does not exist for
   `@changesets/cli`; only `3.0.0-next.*` do. Per semver, `^3.0.0` does not even
   match `3.0.0-next.8`, so the peer excludes the very version being catalogued.
2. **Drift never converges.** `detectPeerDrift` (`drift.ts:17`) compares the
   derived `^3.0.0` against the actual `^3.0.0-next.8`, sees a mismatch, and
   reports drift. The derived value can never equal the actual value, so this
   fires on *every* run, permanently.
3. **Keep still writes.** Drift makes the entry actionable, and the keep branch
   of `buildEdits` (`edits.ts:24`) applies the drift-peer rewrite regardless of
   the user choosing keep. That is the reported symptom.

### Fix

**`derivePeerRange` stops reconstructing.** For `lock`, the derived peer is the
operator plus the version *as given*, prerelease and build identifiers intact.
`lock-minor` continues to floor the patch to `.0`, but **only for a stable
version**.

| Strategy | Input | Derived peer |
| -------- | ----- | ------------ |
| `lock` | `^3.4.1` | `^3.4.1` |
| `lock` | `^3.0.0-next.8` | `^3.0.0-next.8` |
| `lock-minor` | `^3.4.1` | `^3.4.0` |
| `lock-minor` | `^3.0.0-next.8` | `^3.0.0-next.8` + warning |

**`lock-minor` on a prerelease degrades to `lock` and warns.** Flooring a
prerelease is not a meaningful operation: `^3.0.0` excludes `3.0.0-next.8`, so
any floor below a prerelease loses the match. Rather than fail, the derivation
degrades to the full prerelease and surfaces a warning that the author's
strategy choice is incompatible with the pinned line.

This requires a signature change: `derivePeerRange` returns
`{ range: string; warning: PeerWarning | null }` rather than a bare string. The
warning propagates to every consumer — the interactive table annotates the row,
the summary and export output print it, and `--yes` treats it as fatal (see
[Strictness](#strictness-under---yes)).

**Drift is left alone.** Once the derivation is correct, `detectPeerDrift`
derives `^3.0.0-next.8`, matches the actual value, and reports no drift; the
entry stops being actionable and the keep branch never fires. The rule that a
keep still applies a drift resync is *correct and intentional* — hand-edit a
range and the peer should follow — and stays. It was only ever writing garbage
because the derivation was producing garbage.

## Part 2 — Registry validation

A new `package/src/cli/validate.ts` checks every range and peer literal before it
is written.

**Predicate: at least one published version satisfies the range.** Not "the exact
version exists" — that would wrongly reject `^3.4.0`, a legitimate `lock-minor`
floor for a package whose `3.4.0` was never published but whose `3.4.1` was.
Conversely `^3.0.0` against a package with only `3.0.0-next.*` releases satisfies
nothing and is rejected.

**Validation runs against the ungated version list.** The `minimumReleaseAge`
gate filters out recently-published versions, so validating an entry's own
current range against the *gated* list would spuriously reject a package
published within the gate window. The raw list must therefore be threaded out of
the resolve step alongside the gated one.

**Failure handling depends on mode.** Interactively, a rejected edit is dropped
and reported in the summary; the rest of the run proceeds, so one bad package
does not block an otherwise-good upgrade. Under `--yes` it is fatal (below).

`buildEdits` is pure and does not know about versions, so edits gain provenance
(`pkg`, whether the edit is a range or a peer, and the value) and a
`validateEdits(edits, rawVersionsByPkg)` pass filters them before `applyEdits`
sees them. `applyEdits` keeps its current `Edit` shape.

## Part 3 — Prerelease candidates

`plan.ts:29` filters all candidates to `sv.isStable`, so a package tracked on a
prerelease line can never be offered a newer prerelease — `^3.0.0-next.8` stays
frozen at `next.8` forever.

New rule: **if the entry's current range is itself a prerelease**, candidates
include prereleases on the same named track (matching the leading prerelease
identifier, e.g. `next`) in addition to the stable line. An entry on a stable
range is completely unaffected and never sees a prerelease.

So `^3.0.0-next.8` begins offering `^3.0.0-next.9`, and picks up `3.0.0` once it
ships stable. The existing `overallMax.gt(current)` guard already prevents an
older stable line (`2.29.0`) from being offered as an "upgrade" over
`3.0.0-next.8`.

## Part 4 — The table UI

### Layout

Replaces the per-package walk. Every package is visible at once, grouped by
catalog (where `pnpm up -i` groups by dependency type).

```text
Enter to update • Esc to cancel

  ── catalog: default ────────────────────────────────────────────────────────
❯ @changesets/cli   (•) ^3.0.0-next.8   ( ) ^3.0.0-next.9                    │ ^3.0.0-next.9
  effect            (•) ^3.21.4         ( ) ^3.21.9      ( ) ^4.0.1 ⚠ major  │ ^3.21.0
  oxc-parser        (•) 0.139.0         ( ) 0.140.0                          │ —
  ── catalog: react ──────────────────────────────────────────────────────────
  react             (•) ^18.3.1         ( ) ^19.2.0 ⚠ major                  │ ^19.0.0
                         keep              in-range      latest
```

Each row is a **radio group**. The leftmost bubble is always *keep* (the current
value) and is preselected, followed by the in-range and latest-overall options
when they exist. A row with only one option renders just the keep bubble —
visible and inert, honest about there being nothing to choose.

The rightmost column is the peer range that *would* be written for the currently
selected bubble. It updates live as the selection moves across the row. A row
with no strategy shows `—`.

Because keep is preselected on every row and each row is an independent radio
group, there is no select-all and no invert: the default state of the table is a
no-op, and a major can only be applied by deliberately moving to its bubble.

### Keys

| Key | Action |
| --- | ------ |
| `↑` `↓` | move between rows |
| `←` `→` | move the selection within a row |
| `⏎` | run the update immediately, from wherever the cursor is |
| `Esc` | exit cleanly, writing nothing |

### Peer-only rows

Drift resync and peer materialization produce entries with no range change. These
render with the keep bubble plus the peer transition in the right column; the
bubble toggles whether the resync applies.

### Up-to-date rows

Hidden unless `--full`, matching the current behavior.

### Scrolling

Rows exceeding the terminal height scroll within a viewport.

## Part 5 — The confirmation summary mirrors the table

The post-selection summary (`summary.ts`) is restructured to render the same
grouped table, statically, with the chosen bubble filled and color carrying the
meaning of each change.

The existing `ChangeStyle` vocabulary in `ui/styled.ts` covers this with no new
styles:

| Selection | Style | Color |
| --------- | ----- | ----- |
| keep | `unchanged` | dim |
| in-range upgrade | `added` | green |
| major upgrade | `changed` | yellow, `⚠ major` |
| warning / rejected edit | `warn` | red |

`summaryLines` keeps returning `StyledLine[]` rendered through the shared
`toAnsi`, so the non-TTY and `--preview` paths inherit the new shape for free.

## Strictness under `--yes`

`--yes` is assumed to run in CI, where a warning scrolls past unread and a bad
range reaches a published artifact. It is therefore strict where the interactive
path is forgiving:

- **Majors are never applied.** Unchanged from today. Crossing a major requires
  interactive mode or a hand-edit of the config.
- **Any warning is a hard error.** The run exits non-zero and writes nothing.
  This covers both the `lock-minor`-on-a-prerelease incompatibility and any range
  that validation found unsatisfiable.

The reasoning: an interactive user sees a warning, goes back, and fixes the
config. A CI run cannot, so it must fail loudly rather than commit a broken peer.

## Affected modules

| File | Change |
| ---- | ------ |
| `cli/peer-range.ts` | Preserve prerelease/build; return `{ range, warning }`; degrade `lock-minor` on a prerelease |
| `cli/validate.ts` | **New.** Range satisfiability against the ungated version list |
| `cli/plan.ts` | Same-track prerelease candidates when the entry is already on a prerelease |
| `cli/edits.ts` | Edit provenance for validation |
| `cli/walk-reducer.ts` | Table reducer: `{ cursor, picks }` replaces `{ index, cursor }` |
| `cli/ui/Walk.ts` | Grouped, column-aligned radio table |
| `cli/summary.ts` | Mirror the table; color by selection |
| `cli/commands/upgrade.ts` | Thread the raw version list; `--yes` strictness; wire validation |
| `cli/drift.ts` | Consumes the new `derivePeerRange` result shape (no behavior change) |

`walk-plan.ts` and the `Decision` contract are unchanged: a decision is still one
item plus one chosen candidate, so everything downstream of the walk is
untouched.

## Testing

- `peer-range`: prerelease and build preservation under both strategies; the
  `lock-minor` degradation warning.
- `drift`: a prerelease entry whose peer matches its strategy reports **no**
  drift (the regression test for the reported bug).
- `edits`: a keep on a prerelease entry produces **no** peer edit.
- `validate`: `^3.4.0` accepted against `[3.4.1]`; `^3.0.0` rejected against
  `[3.0.0-next.8]`; gated-vs-ungated list selection.
- `plan`: prerelease candidates offered on a prerelease entry, withheld on a
  stable one.
- `walk-reducer`: row/column navigation, radio selection, keep-default, submit
  and cancel.
- Integration: `--yes` exits non-zero on a warning and writes nothing.

## Related documentation

- [upgrade-cli.md](../upgrade-cli.md) — the pipeline this modifies.
- [export-cli.md](../export-cli.md) — the shared `StyledLine`/`toAnsi` render layer.
- [the interop peer strategy spec](2026-06-27-interop-peer-strategy-design.md) —
  `PeerStrategy` and the release-age gate.
