# @example/rolldown

The vanilla-rolldown example — see also [`examples/tsdown/`](../tsdown) and [`examples/effected/`](../effected), which wire the same `PnpmConfigPlugin({...})` call through tsdown and `effected package build` instead.

Two files wire the plugin into a plain rolldown build:

- `rolldown.config.ts` — a `defineConfig` that runs `PnpmConfigPlugin({...})` inline, authoring a `default` catalog (`typescript`, `vitest`), an `overrides` entry, `publicHoistPattern`, `allowBuilds`, `strictDepBuilds`, `minimumReleaseAge` and `confirmModulesPurge`. It targets `platform: "node"` (so the emitted pnpmfile externalizes `node:*` builtins) and switches its output path between `dist/dev/pkg/pnpmfile.mjs` and `dist/prod/pkg/pnpmfile.mjs` depending on which `build:*` script invoked it.
- `src/pnpmfile.ts` — the actual build entry, re-exporting the runtime `hooks` from the plugin's virtual pnpmfile module.

`rolldown -c` bundles `src/pnpmfile.ts` through the plugin into a self-contained `pnpmfile.mjs`. The e2e test under `__test__/` builds it and asserts the output carries the runtime hooks with no external imports, so pnpm can load it without `node_modules` present.
