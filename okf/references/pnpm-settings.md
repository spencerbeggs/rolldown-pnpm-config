---
type: Reference
title: pnpm settings
description: A stable citation point for what a pnpm workspace/`.npmrc` setting means, and which source wins when the official docs and the schemastore schema disagree.
sources:
  - id: pnpm-docs
    resource: "https://pnpm.io/settings"
  - id: schemastore
    resource: "https://json.schemastore.org/pnpm-workspace.json"
generated:
  by: okfit/claude-code
  at: 2026-11-13T04:57:23Z
tags:
  - architecture
integrity:
  generated:
    body: 358aa75db3694309
---

# pnpm settings

This exists so the bundle can cite a stable authority for what a pnpm
workspace setting means, rather than each concept re-describing pnpm's own
docs from memory.

## Which source wins

On any conflict between the two sources, `pnpm-docs` (`https://pnpm.io/settings`)
is authoritative — it is the canonical, hand-maintained reference. `schemastore`
(`https://json.schemastore.org/pnpm-workspace.json`) is a community-maintained
JSON Schema that may lag behind current pnpm releases and should be treated
as a secondary, sometimes-stale source.[^pnpm-docs][^schemastore]

## Which pnpm this repository targets

The managed settings are pnpm 12's, as `@effected/pnpm/settings` derives them
from pnpm 12's config crate. `confirmModulesPurge`, absent from both sources
above, is a pnpm 11 setting pnpm 12 does not read, and is not offered.

[^pnpm-docs]: pnpm-docs
[^schemastore]: schemastore
