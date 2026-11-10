---
"rolldown-pnpm-config": patch
---

## Bug Fixes

A catalog member that `overridesFromCatalogs` pins now ships its catalog entry as the exact pinned version. Before, a member authored as `range: "~4.1.2"` shipped `effect: ~4.1.2` beside the override `"effect@^4.0.0": "4.1.2"`. pnpm never matches an override against a `catalog:` specifier, so once `4.1.3` was published a dependent writing `catalog:` resolved `4.1.3` while everything the override reached resolved `4.1.2`, and the graph carried two copies.

* The shipped pnpmfile, `export` and `preview` all emit the pinned version, so the catalog and the override always name the same version
* The authored range is untouched, so `upgrade` and `upgrade --check` still read and rewrite it, and an explicit `peer` is kept
* The `:peers` catalog keeps its peer range
* Members the directive skips (outside `include`, in `exclude`, prerelease or compound ranges) keep their range verbatim
* When a hand-authored override wins on the selector, the catalog takes its value if that value is an exact version and keeps the authored range otherwise
