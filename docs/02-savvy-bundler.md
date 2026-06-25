# Using @savvy-web/bundler

If you already build with `@savvy-web/bundler`, this is the same `PnpmConfigPlugin` with the build wiring done for you. The bundler wraps tsdown over rolldown, so you hand it the plugin and a couple of loose-file mappings and skip the hand-written rolldown config. The difference from the vanilla path is the output: the bundler emits both `pnpmfile.mjs` and `pnpmfile.cjs`.

## Install

```bash
npm install -D @savvy-web/bundler rolldown-pnpm-config
# or
pnpm add -D @savvy-web/bundler rolldown-pnpm-config
```

## The build file

Author the config exactly as in [getting started](./01-getting-started.md), then pass `PnpmConfigPlugin(plugin)` to `defineBuild` and map each pnpmfile output to the build entry through `looseFiles`.

```ts
import { defineBuild, runBuild } from "@savvy-web/bundler";
import { PnpmConfigPlugin, defineCatalogs, definePlugin } from "rolldown-pnpm-config";

const plugin = definePlugin({
  catalogs: defineCatalogs([{ name: "silk", peers: true, packages: { typescript: "^5.9.0", vitest: "^4.0.0" } }]),
  overrides: { "tar@<6.2.1": ">=6.2.1" },
  publicHoistPattern: ["@types/*"],
  allowBuilds: { esbuild: true },
  strictDepBuilds: true,
  minimumReleaseAge: { value: 1440, enforcement: "warn" },
  confirmModulesPurge: false,
});

const config = defineBuild({
  plugins: [PnpmConfigPlugin(plugin)],
  meta: false,
  bundleNodeModules: true,
  looseFiles: {
    "pnpmfile.mjs": "./src/pnpmfile.ts",
    "pnpmfile.cjs": "./src/pnpmfile.ts",
  },
});

export default config;

if (import.meta.main) {
  await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
```

The build entry is the same one the vanilla path uses. Here it is two files — the re-export and the reference directive split into a dedicated ambient declaration.

```ts
// src/pnpmfile.ts
export { hooks } from "rolldown-pnpm-config/virtual/pnpmfile";
```

```ts
// types/refs.d.ts
/// <reference types="rolldown-pnpm-config/virtual" />
```

## Build

```bash
node savvy.build.ts --target prod
# writes pnpmfile.mjs and pnpmfile.cjs to the project root
```

Both files share the same bundled runtime; only the module format differs.

## Why two files

The `.mjs` output is the one pnpm 11 loads. The `.cjs` alongside it is a Turborepo fallback — some Turbo resolution paths reach for the `.cjs` extension, and shipping both keeps those cases working. If you are not running under Turborepo you can drop the `pnpmfile.cjs` entry from `looseFiles` and emit only the `.mjs`.

Once built, the consuming repo wires the pnpmfile in the same way as the vanilla path. See [how pnpm consumes the output](./01-getting-started.md#how-pnpm-consumes-the-output).
