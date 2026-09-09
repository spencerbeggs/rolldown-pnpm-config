---
type: Glossary
title: interop group
description: The set of interop-marked packages within one catalog, reconciled against each other's peerDependencies — with the ceiling/floor vocabulary that describes the reconciliation.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: interop-impl
    resource: ../../package/src/cli/interop.ts
---

# interop group

An interop group is the set of packages within a single catalog whose
`strategy` is `"interop"`, reconciled against each other's declared
`peerDependencies` by the `upgrade` CLI. Two functions carry the
reconciliation:

- `resolveGroup` pins each member at its chosen version — the
  **ceiling** — searching downward through candidates ≤ ceiling only
  when the ceiling itself conflicts with another member's peer
  range[^interop-impl].
- `deriveFloors` then sets each member's `peer` to
  `^<lowest in-group floor>` — the **floor** — by collecting, for every
  package a resolved member depends on, the lowest version any
  in-group consumer's declared peer range would still accept, and
  capping the derived range with a caret at that lowest
  floor[^interop-impl].

"Ceiling" and "floor" are this reconciliation's own vocabulary: the
ceiling is the highest version a member can resolve to before it starts
breaking a peer in its group, and the floor is the lowest version the
group can commit to supporting as a peer range.
