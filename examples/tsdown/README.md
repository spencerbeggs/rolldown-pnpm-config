# @example/tsdown

This example shows how to configure `rolldown-pnpm-config` through [tsdown](https://tsdown.dev) instead of a standalone `rolldown.config.ts`.

If you want the plain Rolldown setup, see [examples/rolldown/](../exampples/rolldown/). If you want the `@savvy-web/bundler` setup, see
`examples/savvy/`.

## How this version is wired

The plugin is configured in `tsdown.config.ts`:

- `defineConfig({...})` comes from `tsdown`.
- `PnpmConfigPlugin({...})` is included in `plugins`.
- `entry` includes both `src/index.ts` and `src/pnpmfile.ts`.

`src/index.ts` re-exports virtual catalogs:

- `export { catalogs } from "rolldown-pnpm-config/virtual/catalogs"`

`src/pnpmfile.ts` re-exports virtual pnpm hooks:

- `export { hooks } from "rolldown-pnpm-config/virtual/pnpmfile"`

At build time, the plugin materializes both virtual modules so the emitted `dist/*` output is self-contained.

## Build scripts

This example uses tsdown scripts in `package.json`:

- `pnpm build:dev` -> `NODE_ENV=development tsdown -d ./dist/dev`
- `pnpm build:prod` -> `NODE_ENV=production tsdown -d ./dist/prod`

The resulting pnpmfile is emitted at:

- `dist/dev/pnpmfile.mjs`
- `dist/prod/pnpmfile.mjs`

Use `./dist/*/pnpmfile.mjs` as your pnpmfile artifact for each mode.
