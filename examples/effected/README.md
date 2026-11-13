# @example/effected

The `effected package build` example — see also [`examples/rolldown/`](../rolldown) and [`examples/tsdown/`](../tsdown), which wire the same `PnpmConfigPlugin({...})` call through vanilla rolldown and tsdown instead.

Four files wire the plugin into an `effected package build` (from `@effected/plugin`):

- `pnpm-config.ts` — default-exports `PnpmConfigPlugin({...})`. `effected.toml`'s `plugins` list loads it, since a TOML file holds data and `plugins` is the one key that brings code into the build. The config authors two catalogs: `effect` (Effect v4 packages with `strategy: "lock"`) and `effect3` (Effect v3 packages with `strategy: "interop"`, so the CLI reconciles their peer ranges as a group). It also sets `overrides`, `publicHoistPattern`, `allowBuilds`, `strictDepBuilds`, `minimumReleaseAge` and a `peerDependencyRules.allowedVersionsFromCatalogs` directive. The file sits at the package root so `rolldown-pnpm-config upgrade`, `preview` and `export` find it.
- `effected.toml` — sets `plugins = ["./pnpm-config.ts"]`, `bundleNodeModules = true`, and a `looseFiles` table that emits both `pnpmfile.mjs` and `pnpmfile.cjs` from the same `src/pnpmfile.ts` entry.
- `src/pnpmfile.ts` — re-exports the runtime `hooks` from the plugin's virtual pnpmfile module.
- `src/index.ts` — re-exports the runtime `catalogs` from the plugin's virtual catalogs module, so consumers can inspect the resolved catalog Map directly.

`pnpm build` writes `dist/prod/npm/pkg/`, including self-contained `pnpmfile.mjs`/`pnpmfile.cjs` outputs. The e2e test under `__test__/` asserts both carry the runtime hooks, a serialized catalogs Map and no `effect` import.
