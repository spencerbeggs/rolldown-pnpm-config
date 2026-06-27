# @example/rolldown

The vanilla rolldown setup from [docs/01-getting-started](../../docs/01-getting-started.md), as a runnable, tested example.

Three files wire the plugin into a plain rolldown build:

- `pnpm-config.ts` — the catalogs and pnpm settings, authored as a plain `PluginConfig` object.
- `src/pnpmfile.ts` — the build entry that re-exports the runtime `hooks` from the plugin's virtual module, with the `/// <reference>` directive for the shipped types.
- `rolldown.config.ts` — runs `PnpmConfigPlugin` and points rolldown at the entry.

`rolldown -c` bundles them into a self-contained `pnpmfile.mjs`. The e2e test under `__test__/` builds it and asserts the output carries the runtime hooks with no external imports.
