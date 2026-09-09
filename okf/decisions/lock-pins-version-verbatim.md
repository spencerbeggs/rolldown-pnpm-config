---
type: Decision
title: '"lock" pins to the version verbatim'
description: "derivePeerRange's \"lock\" strategy reuses the range's version text verbatim instead of rebuilding it from parsed major.minor.patch, fixing a bug where reconstruction silently dropped prerelease/build identifiers."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: peer-range
    resource: package/src/cli/peer-range.ts
  - id: drift
    resource: package/src/cli/drift.ts
  - id: edits
    resource: package/src/cli/edits.ts
tags: []
---

# "lock" pins to the version verbatim

## Context

`derivePeerRange(range, strategy)` (`package/src/cli/peer-range.ts:54-83`)
is the single offline primitive that recomputes a catalog entry's
materialized `peer` literal from its `range` and
`PeerStrategy`.[^peer-range] An earlier implementation reconstructed the
derived version from parsed `major.minor.patch` components rather than
reusing the input text. For a prerelease-pinned entry such as
`^3.0.0-next.8` with `strategy: "lock"`, that reconstruction silently
dropped the prerelease identifier and produced `^3.0.0` — a range that was
never published and, per semver, does not even match the version
`3.0.0-next.8` it was derived from. That bug made `detectPeerDrift`
(`package/src/cli/drift.ts:20-25`) report permanent drift, because the
derived value could never equal the actual materialized peer, and it made
the keep branch of `buildEdits` (`package/src/cli/edits.ts:55-56`) rewrite
the peer literal even when the author explicitly chose keep — the
reported symptom the fix addresses.[^drift][^edits]

## Decision

`"lock"` pins to the version **as given**: `derivePeerRange` reuses the
range's version text verbatim (operator preserved) rather than rebuilding
it from parsed components, so prerelease and build identifiers survive
intact (`peer-range.ts:64-67`).[^peer-range] `"lock-minor"` still floors a
**stable** version's patch to `.0` and intentionally drops build metadata
in doing so — build metadata identifies a specific build of the
un-floored version, and semver ignores it when matching ranges
regardless.[^peer-range] On a **prerelease** version, flooring is not a
meaningful operation — `^3.0.0` excludes `3.0.0-next.8` outright, excluding
the very version being catalogued — so `"lock-minor"` degrades to
`"lock"` behavior and returns a `lock-minor-prerelease` warning rather
than silently emitting a range that can never be satisfied
(`peer-range.ts:69-80`).[^peer-range] `derivePeerRange` therefore returns
`{ range, warning }` (`PeerDerivation`, `peer-range.ts:24-27`) rather than
a bare string, so the warning can propagate to every consumer — the
interactive table row, the summary, export output, and `--yes`'s
strictness check.[^peer-range] Once the derivation is correct,
`detectPeerDrift` derives the same prerelease-preserving value the
materialized peer already holds, reports no drift, and the keep branch's
drift-resync rewrite never fires (`drift.ts:20-25`).[^drift] The
keep-still-applies-a-drift-resync rule itself is correct and intentional
and stays unchanged — a hand-edited range should still pull its peer
along; it was only ever writing garbage because the derivation was
producing garbage.

## Alternatives rejected

- **Keep reconstructing from `major.minor.patch` and special-case
  prereleases elsewhere (e.g. in drift detection).** Rejected: the defect
  is in the derivation itself, not in how its output is consumed;
  patching a downstream consumer would leave the same wrong value
  reachable from any other caller of `derivePeerRange`.
- **Fail `derivePeerRange` outright on a prerelease under `lock-minor`
  instead of degrading with a warning.** Rejected: failing hard would
  block every subsequent run on an entry the author may have deliberately
  pinned to a prerelease track; degrading to `lock` behavior and
  surfacing a warning lets the run proceed while still telling the author
  their strategy choice does not fit the pinned line
  (`peer-range.ts:69-80`).[^peer-range]
- **Keep `derivePeerRange`'s return type as a bare string and encode the
  warning some other way (a side channel, a thrown error).** Rejected: the
  warning has to reach the interactive table row, the summary, and the
  `--yes` strictness check as ordinary data; folding it into the return
  value (`PeerDerivation`) is simpler than threading a parallel channel
  through every consumer.

## Consequences

- Any future `PeerStrategy` derivation must preserve the input version
  text verbatim wherever it pins rather than reconstructing from parsed
  components, or it risks reintroducing the same prerelease/build-metadata
  loss.
- `detectPeerDrift` and the keep branch of `buildEdits` depend on
  `derivePeerRange` being correct for this fix to hold — a regression in
  the primitive re-manifests as permanent drift and an unwanted rewrite on
  keep, exactly as before.
- `"interop"` is excluded from this per-package derivation path entirely
  (`detectPeerDrift` explicitly excludes `strategy === "interop"`,
  `drift.ts:22`; see the interop-group-reconcile decision) — this fix does
  not touch interop's group-wise peer computation.[^drift]

[^peer-range]: peer-range
[^drift]: drift
[^edits]: edits
