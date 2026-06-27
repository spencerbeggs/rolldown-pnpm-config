---
"rolldown-pnpm-config": minor
---

## Features

Declarative pnpm config through a single `PnpmConfigPlugin({...})` entry point. Author your catalogs and pnpm-workspace settings as one object and the build emits a self-contained `pnpmfile`. Catalogs are inline and keyed by name, with each package given a bare range or an object carrying a materialized `peer` range and an optional `strategy` (`"lock"` / `"lock-minor"`). The build reads peer ranges from source verbatim and never derives them; a `<name>Peers` catalog is generated only for packages that declare a `peer`. This replaces the former `defineCatalogs`, `definePlugin`, and catalog-level `peers: true` shape, which are removed in favor of the single inline form.

A new `rolldown-pnpm-config upgrade` command keeps catalog versions current by rewriting the version ranges in your config file in place. It locates the version literals statically (the config is never executed), resolves available versions from the registry through `pnpm` (reusing your `.npmrc`, scoped registries, and auth), and rewrites them while preserving each range's operator and never crossing a major version non-interactively.

- An interactive per-package walk (the default) to choose the latest in-range version, the latest overall version, or to keep the current one.
- `--yes` applies the latest in-range version to every package non-interactively.
- `--dry-run` prints the pending diff and writes nothing.
- `--catalog <name>` limits the run to a single catalog.
- Strategy-managed `peer` ranges are recomputed when a package is upgraded and resynced when a hand-edited range leaves them stale, and a `peer` literal is materialized for packages that declare a `strategy` but have no `peer` yet.
- The config file is autodetected when no path is given.
