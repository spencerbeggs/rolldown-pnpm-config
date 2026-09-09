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
  at: 2026-09-09T06:03:08Z
tags:
  - architecture
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

## Known gap in both sources

`confirmModulesPurge` is a real, working boolean pnpm setting — this
repository's descriptor table and tests exercise it — but it is absent
from both `pnpm-docs` and the `schemastore` schema as of the dates
recorded above.[^pnpm-docs][^schemastore]

[^pnpm-docs]: pnpm-docs
[^schemastore]: schemastore
