# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Project Status

`rolldown-pnpm-config` is a working, released library for authoring pnpm
config-dependency plugins, published from `package/` through the changesets
release flow. There is no source at the repo root. The workspace also contains
`examples/*` — three example consumer workspaces (`rolldown`, `savvy`,
`tsdown`) that exercise the plugin under different bundlers rather than owning
any part of it.

### Documentation bundle (`okf/`)

Architecture, decisions, and contracts live in the [OKF](https://github.com/okf-project/okf)
knowledge bundle at `okf/`, indexed at `okf/index.md`. Load a concept when the
task touches the area it covers; do not load the bundle by default.

- `okf/project.md` — the project's purpose, boundaries, and non-goals. Load
  when you need the whole-repo frame before touching anything else.
- `okf/modules/` (5) — one file per owned unit of code: `plugin-engine.md`
  (the build-time engine, `PnpmConfigPlugin`, freeze), `runtime.md` (the
  zero-dependency pnpmfile runtime, `createHooks`, strategy table),
  `descriptors.md` (the 121-field descriptor table), `cli.md` (`upgrade`,
  `export`, `preview`), `patches.md` (patch discovery and path rewrite). Load
  the matching module before editing `package/src/**` under that area.
- `okf/decisions/` (22) — a choice made, the alternatives rejected, and why.
  Load before changing something that looks arbitrary — e.g. why builds never
  write (`builds-never-write.md`), why Effect is fenced to build time
  (`effect-at-build-time-only.md`), why the descriptor table is the single
  source of truth (`descriptor-table-as-source-of-truth.md`), why major
  bumps are interactive-only (`major-bumps-interactive-only.md`), or why the
  examples link the package's TypeScript source through tsx
  (`workspace-source-links.md`) — before reversing it.
- `okf/interfaces/` (10) — contracts consumers depend on: the authoring
  surface (`plugin-config.md`), the `{ base, manifest, name }` runtime payload
  (`base-manifest-name.md`), virtual module specifiers (`virtual-modules.md`),
  the managed-fields coverage list (`managed-pnpm-fields.md`), the
  `upgrade`/`export`/`preview` CLI contracts, and the CLI's audience, stream
  and exit-code contract (`cli-output.md`). Load before changing anything a
  plugin author's config or a consumer's build depends on.
- `okf/conventions/` (7) — rules to follow, not descriptions of current
  behavior: import/module style, commit format, test layout, adding a managed
  field only through the descriptor table, never unsetting `private` in
  source, keeping `virtual.d.ts` self-contained, keeping the managed-fields
  interface in step with the descriptor table.
- `okf/runbooks/` (3) — ordered operational procedures: building the package
  (`build-the-package.md`), recovering from a stale config-dependency lockfile, and the
  release/publish flow. Load before running a build or a release, not after
  something breaks.
- `okf/glossary/` (8) — terms this project uses in a specific sense (`base`,
  `manifest`, `freeze`, `strategy`, `divergence`, `enforcement`,
  `interop-group`, `materialize`). Load when a word in this codebase doesn't
  mean what the wider pnpm/Effect ecosystem means by it.
- `okf/limitations/` (2) and `okf/references/pnpm-settings.md` — known edges
  of a contract, and the mirrored citation point for what a pnpm setting
  means when the docs and the schemastore schema disagree.
- `okf/models/descriptor-table.md` — the maintainer-side shape of one
  descriptor-table entry: what it contains, what freeze and the registry
  derive from it, and what breaks if an entry is wrong. Load before adding or
  editing a descriptor.

## Keeping the Bundle Current

When a change alters the architecture, a contract, or the reasoning behind
either, update the matching concept under `okf/` in the same branch and run
`okfit validate`. Adding a concept is cheaper than letting an existing one go
stale — a wrong concept costs more than a missing one.

A migrated or newly written `Decision` stays `status: draft` until a human
runs `okfit verify` on it; agents never author the `verified` field, and
`generated.at` is stamped by `okfit sync`, never by hand.

## Build Pipeline

`package/` builds with `effected package build` (the `build` script in
`package/package.json`; the `effected` bin comes from the root devDependency
`@effected/plugin`), configured by `package/effected.toml`, whose
`[package.build]` table sets `dtsExternals = ["rolldown"]`. There is one
build and no dev build:

| Output | Directory | Purpose |
| ------ | --------- | ------- |
| Production | `dist/prod/npm/pkg/` | Published to npm |

`dist/prod/` also holds `targets.json` and `issues.json`; there is no
`dist/dev/` and no top-level `dist/npm/`. See
`okf/runbooks/build-the-package.md`.

The example workspaces do not consume a build: they link `package/`'s
TypeScript source (`exports` and `bin` point at `src/*.ts`), loaded by tsx
through `nodeOptions: --import=tsx` in `pnpm-workspace.yaml` — see
`okf/decisions/workspace-source-links.md`. The examples keep their own
`build:dev`/`build:prod` tasks, because they stand in for consumers building
under rolldown, tsdown and `@savvy-web/bundler`.

### How `private: true` Works

The source `package.json` is marked `"private": true` — **this is intentional
and correct**. There is no `transform()` callback in this repo: the
`package.json` transform (setting `private` from `publishConfig.access`,
rewriting `exports` and `bin`, stripping
`devDependencies`/`scripts`/`publishConfig`/`devEngines`) is the default of
`effected package build`. Never manually set `"private": false` in the
source `package.json` — see `okf/conventions/never-unset-private-in-source.md`.

### Publish Targets

`package/package.json`'s `publishConfig.targets` declares only `{ npm: true
}`, and the resolved `dist/prod/targets.json` shows a single `npm` target
publishing to `https://registry.npmjs.org`. The actual publish steps run in
an external reusable workflow
(`spencerbeggs/.github/.github/workflows/release.yml@main`) that lives
outside this repo — see `okf/runbooks/release-and-publish.md` for what is
verifiable here.

### Turbo Orchestration

[Turbo](https://turbo.build/) manages build task dependencies and caching:

- `types:check` runs first; it depends only on `^types:check`
- The package's `build` depends on `types:check` and outputs `dist/prod/**`
- The examples' `build:dev` and `build:prod` do not depend on `^build`: they
  load the package's source, and hash `package/src/**` as an input instead.
  A `^build` edge would make the three example `prepare` hooks, which
  `pnpm install` runs in parallel, each build the package into the same
  `dist/prod`, and install fails with `ENOENT`
- Cache excludes: `*.md`, `.changeset/**`, `.claude/**`, `.github/**`,
  `.husky/**`, `.vscode/**`
- Environment pass-through: `GITHUB_ACTIONS`, `CI`

## Savvy-Web Tool References

This project depends on several `@savvy-web/*` packages. These are in active
development — if behavior seems unexpected, explore both the GitHub docs and the
installed source.

| Package | Purpose | GitHub | Local Source |
| ------- | ------- | ------ | ------------ |
| bundler | Consumer bundler exercised by `examples/savvy` (not this repo's build) | [savvy-web/bundler](https://github.com/savvy-web/bundler) | `examples/savvy/node_modules/@savvy-web/bundler/` |
| commitlint | Conventional commit + DCO enforcement | [savvy-web/commitlint](https://github.com/savvy-web/commitlint) | `node_modules/@savvy-web/commitlint/` |
| changesets | Versioning, changelogs, release management | [savvy-web/changesets](https://github.com/savvy-web/changesets) | `node_modules/@savvy-web/changesets/` |
| lint-staged | Pre-commit file linting via Biome | [savvy-web/lint-staged](https://github.com/savvy-web/lint-staged) | `node_modules/@savvy-web/lint-staged/` |

`package/tsconfig.json` extends `@effected/plugin/tsconfig/ecma.json`.

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:fix:unsafe   # Auto-fix including unsafe transforms
pnpm run lint:md           # Check markdown with markdownlint
pnpm run lint:md:fix       # Auto-fix markdown issues
pnpm run typecheck         # Type-check via Turbo (runs tsgo)
pnpm run test              # Run all tests
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with v8 coverage report
```

### Building

```bash
pnpm run build             # Build the package and the examples via Turbo
pnpm run ci:build          # Same, with CI=true and full logs
```

### Running a Specific Test

```bash
pnpm vitest run src/index.test.ts
```

## Code Quality and Hooks

### Biome

Unified linter and formatter replacing ESLint + Prettier. Configuration in
`biome.jsonc` extends `@savvy-web/silk/biome`.

### Commitlint

Enforces conventional commit format with DCO signoff. Configuration in
`lib/configs/commitlint.config.ts` uses the `CommitlintConfig.silk()` preset.

### Husky Git Hooks

| Hook | Action |
| ---- | ------ |
| `pre-commit` | Runs lint-staged (Biome on staged files) |
| `commit-msg` | Validates commit message format via commitlint |
| `pre-push` | Runs tests for affected packages using Turbo |
| `post-checkout` | Package manager setup |
| `post-merge` | Package manager setup |

### Lint-Staged

Configuration in `lib/configs/lint-staged.config.ts` uses the `Preset.silk()`
preset from `@savvy-web/lint-staged`.

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins (e.g., `import fs from 'node:fs'`)
- Separate type imports: `import type { Foo } from './bar.js'`

### Commits

All commits require:

1. Conventional commit format (`feat`, `fix`, `chore`, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`

### Publishing

`package/package.json`'s `publishConfig.targets` declares only an `npm`
target (see § Publish Targets). Versioning and changelog generation go
through [@savvy-web/changesets](https://github.com/savvy-web/changesets). The
release workflow (`.github/workflows/release.yml`) calls out to an external
reusable workflow, `spencerbeggs/.github/.github/workflows/release.yml@main`,
which is not in this repo — see `okf/runbooks/release-and-publish.md`.

## Testing

- **Framework**: [Vitest](https://vitest.dev/) with v8 coverage provider
- **Pool**: Uses `forks` (not threads) for broader compatibility
- **Config**: `vitest.config.ts` wires `AgentPlugin` from `@vitest-agent/plugin` into `defineConfig` from `vitest/config`; `AgentPlugin.discover()` supplies workspace `projects` and `tags`
- **CI**: `pnpm run ci:test` sets `CI=true` and enables coverage

### Test Directory

All tests live in `__test__/`, never co-located in `src/`. See
`__test__/CLAUDE.md` for the full directory structure and rules.

- Unit tests: `__test__/*.test.ts`
- E2e tests: `__test__/e2e/*.e2e.test.ts`
- Integration tests: `__test__/integration/*.int.test.ts`
- Shared mocks and helpers go in the `utils/` subdirectory for each category
- Static test data goes in the `fixtures/` subdirectory for each category
