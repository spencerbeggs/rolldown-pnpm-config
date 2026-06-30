# rolldown-pnpm-config documentation

`rolldown-pnpm-config` is a rolldown plugin whose output is a pnpm config-dependency `pnpmfile`. You author your catalogs and pnpm settings as one declarative config, run a build and get a self-contained `pnpmfile.mjs` that pnpm 11 loads to merge those centrally-managed settings into a consuming repo.

## Install

```bash
npm install -D rolldown-pnpm-config rolldown
# or
pnpm add -D rolldown-pnpm-config rolldown
```

## Pages

- [Getting started](./01-getting-started.md) — Wire the plugin into a vanilla rolldown build and emit a pnpmfile.
- [Using @savvy-web/bundler](./02-savvy-bundler.md) — The same plugin with the build wiring done for you, emitting both `.mjs` and `.cjs`.
- [Concepts](./03-concepts.md) — What the emitted pnpmfile does: config dependencies, catalogs and the enforcement model.
- [pnpm settings coverage](./04-pnpm-settings-coverage.md) — Every pnpm-workspace.yaml setting the plugin manages and the ones it leaves to each consumer.
- [Upgrading catalogs](./05-upgrading-catalogs.md) — The `upgrade` CLI that rewrites catalog version ranges in place.
- [Exporting to pnpm-workspace.yaml](./06-exporting.md) — The `export` and `preview` CLI, the `local` merge directive and per-repo `excludeByRepo` filtering.
