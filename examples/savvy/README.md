# @example/savvy

The `@savvy-web/bundler` half of the plugin's two dogfood examples — see also [`examples/rolldown/`](../rolldown), which wires the same `PnpmConfigPlugin({...})` call through vanilla rolldown instead.

Three files wire the plugin into a `@savvy-web/bundler` build:

- `savvy.build.ts` — calls `build()` from `@savvy-web/bundler` with `PnpmConfigPlugin({...})` in its `plugins` array. The config authors two catalogs: `silk` (`@changesets/cli` pinned to a prerelease with `strategy: "lock"`, `typescript` and `vitest` with `strategy: "lock-minor"`) and `effect` (`effect` and `@effect/platform` with `strategy: "interop"`, so the CLI reconciles their peer ranges as a group). It also sets `overrides`, `publicHoistPattern`, `allowBuilds`, `strictDepBuilds`, `minimumReleaseAge` and `confirmModulesPurge`, plus `bundleNodeModules: true` and a `looseFiles` map that emits both `pnpmfile.mjs` and `pnpmfile.cjs` from the same `src/pnpmfile.ts` entry.
- `src/pnpmfile.ts` — re-exports the runtime `hooks` from the plugin's virtual pnpmfile module.
- `src/index.ts` — re-exports the runtime `catalogs` from the plugin's virtual catalogs module, so consumers can inspect the resolved catalog Map directly.

The build emits self-contained `pnpmfile.mjs`/`pnpmfile.cjs` outputs; the e2e test under `__test__/` asserts both carry the runtime hooks, a serialized catalogs Map and no `effect` import.
