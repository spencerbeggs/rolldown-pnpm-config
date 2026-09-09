---
type: Decision
title: No execution of the config
description: Discovery and rewrite in the upgrade CLI are 100% static through oxc byte spans; the config is never executed to learn its catalog versions.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: discover
    resource: package/src/cli/discover.ts
  - id: select-file
    resource: package/src/cli/select-file.ts
  - id: catalogs
    resource: package/src/catalogs.ts
tags:
  - architecture
---

# No execution of the config

## Context

`rolldown-pnpm-config upgrade` needs to read the catalog version ranges
declared in a `PnpmConfigPlugin({...})` call, offer the author upgrade
candidates, and rewrite the chosen ranges back into the source file in
place. The naive way to learn "what does this config currently declare" is
to run it — import the file, call the exported plugin factory, and inspect
the resulting object.

## Decision

`upgrade` never executes the config. `discoverCatalogEntries`
(`package/src/cli/discover.ts:80-159`) parses the source with
`oxc-parser`, finds the one `PnpmConfigPlugin(...)` call, and walks
`.catalogs.<name>.packages` directly over the AST, using byte-offset spans
for later surgical rewrite.[^discover] Each package whose range is a
simple-operator string literal becomes a `CatalogEntry`; anything
non-literal or with a complex multi-comparator range is reported in
`skipped` as `<catalog>.<pkg>` and never throws
(`discover.ts:72-77,136-139`).[^discover] This works by construction
because there is exactly one canonical call shape (`PnpmConfigPlugin(...)`)
and catalog values are literals or the `{ range, peer?, strategy?,
source? }` object form (`CatalogPackageSpec`,
`package/src/catalogs.ts:29-36`) with a literal `range`, so an "execute for
truth" step is unnecessary — the AST already contains the
truth.[^discover][^catalogs] Static discovery is also on-brand for a
rolldown-adjacent package and avoids running arbitrary build config just
to learn its versions.

`normalizeCatalogs` (the runtime side, `package/src/catalogs.ts:57-83`)
mirrors this same "skip, never throw" posture for a non-declaration
sibling inside `catalogs` (a function, an object with no `packages` map):
both sides treat an unrecognized shape as absent rather than a crash,
because "catalog silently not found" is already indistinguishable from
"nothing to update," so throwing would only be strictly
worse.[^catalogs]

## Alternatives rejected

- **Import and execute the config file to inspect the returned plugin
  options.** Rejected: it would run arbitrary author code (including any
  side effects reachable from the config module graph) merely to read
  version strings, and it still would not give byte-offset spans to
  rewrite from — a second static pass would be needed for that anyway.
- **Support arbitrary catalog value expressions (computed, spread,
  aliased) via partial evaluation.** Rejected: catalog values are meant to
  be literals; a non-literal or complex multi-comparator range is surfaced
  as a skip instead of being evaluated or mangled
  (`discover.ts:136-139`).[^discover]

## Consequences

- A catalog entry must be a simple-operator string literal (or the object
  form with a literal `range`) to be discovered and rewritten; anything
  else is reported as skipped, never silently dropped or guessed at.
- Discovery assumes exactly one `PnpmConfigPlugin(...)` call per file;
  `findConfigFiles`/`pickConfigCandidate`
  (`package/src/cli/select-file.ts:14-52`) errors when zero or multiple
  candidate files with a usable call are found in the autodetected cwd
  scan.[^select-file]
- Any future catalog value shape (a new literal form, a new nesting) needs
  explicit support in `discoverCatalogEntries`'s AST walk — there is no
  execution fallback to fall back on for an unrecognized shape.

[^discover]: discover
[^select-file]: select-file
[^catalogs]: catalogs
