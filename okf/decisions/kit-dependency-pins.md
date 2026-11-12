---
type: Decision
title: The package pins its kit dependencies exactly through `catalog:effected:exact`
description: "Every `@effected/*`, `@effect/*` and `effect` dependency of package/ is written `catalog:effected:exact`, so the published manifest carries plain versions and a consumer's install resolves the same kit tree this package was tested against."
status: draft
sources:
  - id: package-json
    resource: package/package.json
  - id: kit-pins-test
    resource: package/__test__/manifest/kit-pins.test.ts
  - id: ledger
    resource: "npm:@effected/pnpm-plugin-effected (effected-renovate upgrade ledger entry 0011, effected#1333)"
  - id: owner
    resource: conversation with the repository owner
    author: human:spencer
    last_modified: 2026-11-11T00:00:00Z
tags:
  - deps
  - release
generated:
  by: okfit/claude-code
  at: 2026-11-12T02:30:03Z
integrity:
  generated:
    body: 3211179f6ad18214
---

# The package pins its kit dependencies exactly through `catalog:effected:exact`

## Context

`package/` publishes a CLI (`rolldown-pnpm-config`) on top of the kit, and
its kit dependencies were written `catalog:effected`, which publishes the
catalog's caret. A caret lets a newer patch of one kit package land in a
consumer's install beside an older peer from another kit release line, so a
consumer could resolve a kit tree this package was never tested against.
The kit's own tool closes the same gap by pinning its kit closure
exactly,[^ledger] and the owner chose the same for this package so the tree
is fixed when a consumer installs it.[^owner]

## Decision

Every `@effected/*`, `@effect/*` and `effect` entry under `dependencies` in
`package/package.json` is written `catalog:effected:exact`, the operator-free
variant of the `effected` catalog.[^package-json] The published manifest
therefore carries plain versions, and the pins move with every bump of the
catalog plugin rather than being hand-maintained. No kit package is taken as
a peer. Packages outside the kit (`ink`, `react`, `oxc-parser`) keep their
ranges, and `devDependencies` are stripped at build time, so they are not
pinned.

`kit-pins.test.ts` reads the source manifest and fails on any kit dependency
not written `catalog:effected:exact`, on an empty kit list, and on any kit
peer.[^kit-pins-test]

## Alternatives rejected

- **Keep `catalog:effected` carets, as a library would.** Rejected: a host
  that imports this package's plugin API shares no Effect services or
  schemas with it at runtime, so deduping onto the host's kit copies buys
  nothing, and the caret is what lets a mismatched kit tree resolve.
- **Hand-write exact versions.** Rejected: they leave the catalog and stop
  moving when the catalog plugin is bumped.
- **Also declare `@effected/changesets`' optional peers (`@effected/markdown`,
  `@effected/markdown-lint`).** Rejected: they are optional, and the
  `PendingChangesets` surface this package uses does not need them.

## Consequences

- A consumer may resolve this package's own kit copies beside newer ones in
  their workspace. That is intended; do not override them onto the newer
  versions.
- A new kit dependency must be written `catalog:effected:exact`, or the test
  fails.
- A regular kit dependency of a kit library inside this package still floats
  within its own caret; the pins cover direct dependencies and, through them,
  every kit peer.

[^package-json]: `package/package.json`
[^kit-pins-test]: `package/__test__/manifest/kit-pins.test.ts`
[^ledger]: npm:@effected/pnpm-plugin-effected, upgrade ledger entry 0011
[^owner]: conversation with the repository owner, 2026-11-11
