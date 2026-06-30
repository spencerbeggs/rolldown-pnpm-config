# Getting started

`rolldown-pnpm-config` is a rolldown plugin whose output is a pnpm config-dependency `pnpmfile`. You author your catalogs and pnpm settings as one declarative config, run a build and get a self-contained `pnpmfile.mjs`. pnpm 11 loads that file in a consuming repo and merges your centrally-managed settings in through its `updateConfig` hook. This page walks the vanilla rolldown path end to end: author the config, wire the plugin into a build and emit the pnpmfile.

## Install

```bash
npm install -D rolldown-pnpm-config rolldown
# or
pnpm add -D rolldown-pnpm-config rolldown
```

Requires Node.js >=24.11.0 to run the build. The emitted `pnpmfile.mjs` targets pnpm 11 in the consuming repo, which is the version that loads `.mjs` pnpmfiles.

## The three files

A vanilla setup is three files: the config you author, a build entry that re-exports the runtime hooks and a rolldown config that runs the plugin.

### 1. Author the config

Declare your catalogs and pnpm settings as a plain `PluginConfig` object.

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

The `name` field is required — use the npm name of the config package itself. It tags runtime warnings as `[<name>]` so consuming repos know which config dependency is speaking. Each other key is a pnpm field the plugin knows how to manage. A field can be a bare value or a `{ value, enforcement }` pair when you want to override the default enforcement for that one field — `minimumReleaseAge` above warns rather than failing on divergence. See [concepts](./03-concepts.md) for the catalog and enforcement model.

### 2. The build entry

The build entry is what rolldown bundles. It re-exports the runtime `hooks` from the plugin's virtual pnpmfile module. The reference directive pulls in the package's shipped virtual-module types, so the import type-checks with no hand-written declaration.

```ts
/// <reference types="rolldown-pnpm-config/virtual" />
export { hooks } from "rolldown-pnpm-config/virtual/pnpmfile";
```

Save this as `src/pnpmfile.ts`.

### 3. The rolldown config

Run `PnpmConfigPlugin` over your authored config and point rolldown at the build entry.

```ts
import { defineConfig } from "rolldown";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";
import { plugin } from "./pnpm-config.js"; // the config from step 1, saved as pnpm-config.ts

export default defineConfig({
  input: "src/pnpmfile.ts",
  // the emitted pnpmfile runs under Node, so target node — this externalizes the
  // `node:*` builtins it uses instead of trying to bundle them
  platform: "node",
  output: { file: "pnpmfile.mjs", format: "esm" },
  plugins: [PnpmConfigPlugin(plugin)],
});
```

## Build

```bash
npx rolldown -c
# writes a self-contained pnpmfile.mjs to the project root
```

`PnpmConfigPlugin(plugin)` serves the virtual module `rolldown-pnpm-config/virtual/pnpmfile`. The build entry re-exports its `hooks`, and rolldown bundles the zero-dependency runtime into the output. The result is a single self-contained `pnpmfile.mjs` — it pulls in only Node's own builtins, so pnpm can load it without any `node_modules` present.

For vanilla rolldown the emit is the single `.mjs` file. The `@savvy-web/bundler` path emits a `.cjs` fallback alongside it — see [using @savvy-web/bundler](./02-savvy-bundler.md).

## How pnpm consumes the output

The emitted `pnpmfile.mjs` is meant to ship as a pnpm config dependency. You publish the package, list it under `configDependencies` in the consuming repo's `pnpm-workspace.yaml` and point pnpm at the shipped pnpmfile.

```yaml
configDependencies:
  my-pnpm-config: "1.0.0+sha512-<integrity-hash>"
```

When pnpm installs, it resolves config dependencies first, loads the contributed `pnpmfile.mjs` and calls its `updateConfig` hook. The hook merges your centrally-managed catalogs and settings into the consuming repo's pnpm config. The exact reference field and integrity format live in pnpm's docs — see [config dependencies](https://pnpm.io/config-dependencies) and [pnpmfile](https://pnpm.io/pnpmfile).
