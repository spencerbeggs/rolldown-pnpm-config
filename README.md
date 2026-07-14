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
- [`docs/`](./docs) — user guide: getting started, using `@savvy-web/bundler`, the concepts behind the emitted pnpmfile, the full pnpm settings coverage reference, upgrading catalogs, exporting to `pnpm-workspace.yaml` and distributing dependency patches.
- Architecture and design notes live in `.claude/design/rolldown-pnpm-config/`.

## Try it out

Run `pnpm install` and `pnpm build` once first — the scripts below proxy to the built `rolldown-pnpm-config` CLI binary, which does not exist until after a build.

Each example package (`examples/savvy/`, `examples/rolldown/`) exposes `pnpm:export`, `pnpm:preview` and `pnpm:up` scripts that run the CLI against its own config. The root re-exposes all six as `pnpm <script>:savvy` / `pnpm <script>:rolldown`:

| Root script | Proxies to | Example config |
| ----------- | ---------- | -------------- |
| `pnpm:export:savvy` | `rolldown-pnpm-config export --dry-run` | `examples/savvy/savvy.build.ts` |
| `pnpm:preview:savvy` | `rolldown-pnpm-config preview` | `examples/savvy/savvy.build.ts` |
| `pnpm:up:savvy` | `rolldown-pnpm-config upgrade savvy.build.ts --dry-run` | `examples/savvy/savvy.build.ts` |
| `pnpm:export:rolldown` | `rolldown-pnpm-config export --dry-run` | `examples/rolldown/rolldown.config.ts` |
| `pnpm:preview:rolldown` | `rolldown-pnpm-config preview` | `examples/rolldown/rolldown.config.ts` |
| `pnpm:up:rolldown` | `rolldown-pnpm-config upgrade rolldown.config.ts --dry-run` | `examples/rolldown/rolldown.config.ts` |

```bash
pnpm pnpm:up:savvy
# runs the interactive upgrade table against examples/savvy/savvy.build.ts;
# --dry-run means Esc or Enter never rewrites the file
```

`export` and `upgrade` are wired with `--dry-run`, and `preview` never writes in the first place — every one of the six scripts above is safe to run, and re-run, without touching either example config.

## Requirements

- Node.js >=24.11.0
- pnpm 11

## License

[MIT](LICENSE)
