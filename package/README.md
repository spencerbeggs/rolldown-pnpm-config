# rolldown-pnpm-config

[![npm](https://img.shields.io/npm/v/rolldown-pnpm-config?label=npm&color=cb3837)](https://www.npmjs.com/package/rolldown-pnpm-config)
[![License: MIT](https://img.shields.io/badge/License-MIT-4caf50.svg)](https://opensource.org/licenses/MIT)
[![Node.js %3E%3D24.11.0](https://img.shields.io/badge/Node.js-%3E%3D24.11.0-5fa04e.svg)](https://nodejs.org/)

A rolldown plugin whose output is a pnpm config-dependency `pnpmfile`. You author your catalogs and pnpm settings as one declarative config. Run a build and you get a self-contained `pnpmfile.mjs`. pnpm 11 loads it and calls its `updateConfig` hook to merge your settings into a consuming repo.

## Install

```bash
npm install -D rolldown-pnpm-config rolldown
# or
pnpm add -D rolldown-pnpm-config rolldown
```

The build runs on Node.js. The emitted `pnpmfile.mjs` targets pnpm 11 in the consuming repo — the pnpm version that loads `.mjs` pnpmfiles.

## Quick start

A vanilla rolldown setup is three files: the config you author, a build entry that re-exports the runtime hooks and a rolldown config that runs the plugin.

Author your catalogs and pnpm settings as a plain `PluginConfig` object. The `name` field is required — use the npm name of the config package itself; it tags runtime warnings as `[<name>]` so consuming repos know which config dependency is speaking:

```ts
import type { PluginConfig } from "rolldown-pnpm-config";

export const plugin = {
  name: "@acme/pnpm-config",
  catalogs: {
    default: { packages: { typescript: "^5.9.0", vitest: "^4.0.0" } },
  },
  overrides: { "tar@<6.2.1": ">=6.2.1" },
  publicHoistPattern: ["@types/*"],
  allowBuilds: { esbuild: true },
  strictDepBuilds: true,
  minimumReleaseAge: { value: 1440, enforcement: "warn" },
  confirmModulesPurge: false,
} satisfies PluginConfig;
```

Add a build entry that re-exports the runtime `hooks` from the plugin's virtual pnpmfile module. The reference directive pulls in the package's shipped virtual-module types, so the import type-checks with no hand-written declaration. Save it as `src/pnpmfile.ts`:

```ts
/// <reference types="rolldown-pnpm-config/virtual" />
export { hooks } from "rolldown-pnpm-config/virtual/pnpmfile";
```

Run `PnpmConfigPlugin` over your authored config and point rolldown at the build entry:

```ts
import { defineConfig } from "rolldown";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";
import { plugin } from "./pnpm-config.js"; // the config above, saved as pnpm-config.ts

export default defineConfig({
  input: "src/pnpmfile.ts",
  // the emitted pnpmfile runs under Node, so target node — externalizes node: builtins
  platform: "node",
  output: { file: "pnpmfile.mjs", format: "esm" },
  plugins: [PnpmConfigPlugin(plugin)],
});
```

Build it:

```bash
npx rolldown -c
# writes a self-contained pnpmfile.mjs to the project root
```

The output pulls in only Node's own builtins, so pnpm can load it without any `node_modules` present. Ship it as a pnpm config dependency and pnpm 11 calls its `updateConfig` hook to merge your settings into the consuming repo.

## Keeping catalogs current

The bundled `rolldown-pnpm-config upgrade` command rewrites the version ranges in your config file in place. Run it with no arguments and it autodetects the config — the single top-level `.ts` file in the current directory that calls `PnpmConfigPlugin(...)`:

```bash
npx rolldown-pnpm-config upgrade
# walks each catalog package, then:
# Applied <n> change(s).
```

The walk is interactive by default. `--yes` takes the latest in-range version without prompting, `--dry-run` prints the planned changes without writing and `--catalog <name>` restricts the walk to one catalog. Pass `--preview` for a non-interactive projection of what the walk would do, with `--full` to show the full tree without context collapsing. The output is colorized in a supporting terminal. For packages that declare a `strategy`, the command also resyncs their materialized peer range. See [upgrading catalogs](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/05-upgrading-catalogs.md) for the full surface.

## Exporting to pnpm-workspace.yaml

For repos that develop the plugin itself and cannot consume it as a config dependency, `rolldown-pnpm-config export` materializes the managed config directly into `pnpm-workspace.yaml`. Pass `--dry-run` to print a colored canonical diff without writing; add `--full` to emit the entire tree rather than changed lines with context. `file:`, `link:`, `workspace:` and `portal:` overrides already present in the file are preserved by default on every run.

The `rolldown-pnpm-config preview` command opens an interactive tabbed view — Changes, Full and Simulated — without writing anything. In a non-interactive terminal it falls back to printing the Changes diff, so it is safe to run in CI.

The optional `local` field on `PluginConfig` adjusts managed settings for this repo's export only — the built pnpmfile and its runtime behavior are unaffected. A bare value overwrites the managed value; the directive form merges it:

```ts
local: {
  // union: add local patterns on top of the managed list
  publicHoistPattern: { strategy: "union", value: ["@acme/*"] },
  // difference: drop one managed override entry
  overrides: { strategy: "difference", value: { "lodash@<4.17.21": ">=4.17.21" } },
  // bare value: overwrite the managed field entirely
  strictDepBuilds: false,
},
```

`publicHoistPattern` also accepts `excludeByRepo` — a map keyed by consuming repo name — to drop specific patterns when the config runs in a named repo:

```ts
publicHoistPattern: {
  value: ["@types/*", "@acme/cli"],
  excludeByRepo: { "consumer-a": ["@acme/cli"] },
}
```

See [exporting to pnpm-workspace.yaml](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/06-exporting.md) for the full surface.

## Documentation

- [Getting started](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/01-getting-started.md) — Wire the plugin into a vanilla rolldown build and emit a pnpmfile.
- [Using @savvy-web/bundler](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/02-savvy-bundler.md) — The same plugin with the build wiring done for you, emitting both `.mjs` and `.cjs`.
- [Concepts](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/03-concepts.md) — What the emitted pnpmfile does: config dependencies, catalogs and the enforcement model.
- [pnpm settings coverage](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/04-pnpm-settings-coverage.md) — Every pnpm-workspace.yaml setting the plugin manages and the ones it leaves to each consumer.
- [Upgrading catalogs](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/05-upgrading-catalogs.md) — The `upgrade` CLI that rewrites catalog version ranges in place.
- [Exporting to pnpm-workspace.yaml](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/06-exporting.md) — The `export` and `preview` CLI, the `local` merge directive and per-repo `excludeByRepo` filtering.

## License

[MIT](LICENSE)
