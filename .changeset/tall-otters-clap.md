---
"rolldown-pnpm-config": major
---

## Breaking Changes

The `upgrade` CLI is now considered stable. This release bundles a correctness fix, a startup/runtime performance pass, and the removal of dead internal surface — together enough to warrant a major version.

### Removed internal exports

A handful of `@internal`-tagged symbols that were nonetheless reachable from the module graph have been deleted. If you imported any of these directly (unsupported, but possible), the import will now fail:

* `reentryCandidates` and `capVersions` — the old interactive re-entry loop, superseded by the live interop table
* `InteropResult.peerDepsOf` and `InteropSummary.adjustments`
* The `hyperlinks` terminal-capability flag (nothing rendered links, so it did nothing)

The `std-osc8` dependency was dropped along with it.

`validateEdits` and `rangeIsSatisfiable` are now synchronous — `rangeIsSatisfiable` returns `boolean` instead of an `Effect`/promise. Any direct caller awaiting these will need to drop the `await`.

## Bug Fixes

`upgrade` misparsed `pnpm view ... --json` and `pnpm config get` output whenever pnpm printed its own `packageManager`-mismatch banner (`[WARN] This project is configured to use X of pnpm. Your current pnpm is Y`) ahead of the real output on stdout. Every registry package then looked like an unresolvable typo, and a stray banner line could corrupt the resolved `minimumReleaseAgeExclude` list. pnpm's notice lines are now stripped before parsing.

## Performance

* Ink and React are only loaded on the interactive upgrade path — `--yes`, `--check`, `--json`, and `--preview` no longer pay the interactive UI's startup cost
* Under a release-age gate, the per-package `versions` and `time` lookups now run concurrently instead of sequentially
* Workspace manifests are enumerated once per run instead of twice
* `export` runs patch discovery once instead of repeating it

## Refactoring

Internal cleanup: consolidated semver helpers, config loading, and AST handling into shared modules; adopted Effect-native idioms throughout the CLI (`SemVer.parseResult`, `Predicate.isObject`, `Effect.promise`, `Effect.orElseSucceed`, `Yaml.parseResult`). No user-visible change.

The runtime's `securityMin` divergence message is now field-agnostic — it reads "Lowers a managed security minimum from X to Y" instead of release-age-specific wording. Behavior is unchanged; only the phrasing.
