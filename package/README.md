# rolldown-pnpm-config

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

Author your catalogs and pnpm settings with `definePlugin` and `defineCatalogs`:

```ts
import { defineCatalogs, definePlugin } from "rolldown-pnpm-config";

export const plugin = definePlugin({
  catalogs: defineCatalogs([{ name: "default", packages: { typescript: "^5.9.0", vitest: "^4.0.0" } }]),
  overrides: { "tar@<6.2.1": ">=6.2.1" },
  publicHoistPattern: ["@types/*"],
  allowBuilds: { esbuild: true },
  strictDepBuilds: true,
  minimumReleaseAge: { value: 1440, enforcement: "warn" },
  confirmModulesPurge: false,
});
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

## Documentation

- [Getting started](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/01-getting-started.md) — Wire the plugin into a vanilla rolldown build and emit a pnpmfile.
- [Using @savvy-web/bundler](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/02-savvy-bundler.md) — The same plugin with the build wiring done for you, emitting both `.mjs` and `.cjs`.
- [Concepts](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/03-concepts.md) — What the emitted pnpmfile does: config dependencies, catalogs and the enforcement model.
- [pnpm settings coverage](https://github.com/spencerbeggs/rolldown-pnpm-config/blob/main/docs/04-pnpm-settings-coverage.md) — Every pnpm-workspace.yaml setting the plugin manages and the ones it leaves to each consumer.

## License

[MIT](LICENSE)
