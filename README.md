# rolldown-pnpm-config

Monorepo for `rolldown-pnpm-config`, a rolldown plugin that compiles your catalogs and pnpm settings into a self-contained pnpm config-dependency `pnpmfile.mjs`. The published library lives in `package/`; the rest of the repo builds, tests and dogfoods it.

## Packages

| Package | Purpose |
| ------- | ------- |
| [`package/`](./package) | The published [`rolldown-pnpm-config`](./package/README.md) library — the rolldown plugin that emits a pnpm config-dependency pnpmfile. |
| [`examples/rolldown/`](./examples/rolldown) | The vanilla rolldown setup from the docs, as a runnable, tested example. |
| [`examples/savvy/`](./examples/savvy) | The same plugin built through `@savvy-web/bundler`, dogfooding the full pipeline. |

## Documentation

- [`package/README.md`](./package/README.md) — npm-facing overview and quick start for the library.
- [`docs/`](./docs) — user guide: getting started, using `@savvy-web/bundler` and the concepts behind the emitted pnpmfile.
- Architecture and design notes live in `.claude/design/rolldown-pnpm-config/`.

## Requirements

- Node.js >=24.11.0
- pnpm 11

## License

[MIT](LICENSE)
