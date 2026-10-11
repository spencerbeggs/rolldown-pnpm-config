# Concepts

This package has two layers. At build time you author a config and the plugin emits a pnpmfile. At install time that emitted pnpmfile runs inside the consuming repo. Knowing which layer you are in explains every other behavior below.

## The two layers

The build layer is where you and the plugin work: you declare the managed config as a `PluginConfig` object, `PnpmConfigPlugin` validates it and serializes it into a virtual pnpmfile module, and your bundler writes that module out as `pnpmfile.mjs`. Everything heavy lives here.

The runtime layer is the emitted `pnpmfile.mjs`. It carries a small zero-dependency runtime and nothing else — no build tooling, no external imports. That constraint exists because a pnpm config dependency cannot bring its own `node_modules`, so the shipped file has to be self-contained.

## Config-dependency pnpmfiles and updateConfig

A pnpm config dependency is a package pnpm fetches before it resolves the rest of the install. It can contribute a `pnpmfile`, which pnpm loads and whose hooks run during install. The hook this package emits is `updateConfig`: pnpm hands it the consuming repo's local pnpm config, and the hook returns a merged config with your centrally-managed settings folded in.

This is how one published package can govern pnpm settings across many repos. Update the config once, republish and every consumer picks up the change on its next install. See pnpm's [config dependencies](https://pnpm.io/config-dependencies) and [pnpmfile](https://pnpm.io/pnpmfile) docs for the loading mechanics.

## Catalogs

A catalog is a named set of version specifiers managed in one place. The `catalogs` field of your `PnpmConfigPlugin` config declares them, and each consuming repo references a catalog entry instead of pinning a version itself. Bumping a version in the catalog updates every repo that points at it. This is the version-management half of what the emitted pnpmfile carries. The pnpm settings are the other half.

Each package is a bare range or the object form `{ range, peer?, strategy? }`. The optional `peer` is a materialized range the runtime emits as a separate peers catalog, and `strategy` tells the [`upgrade` CLI](./05-upgrading-catalogs.md) how to recompute that peer when the range moves. Bumping these ranges over time is the job of that command.

The peers catalog is emitted under the colon-delimited name `<name>:peers`. Earlier releases also emitted a legacy camelCase alias (`<name>Peers`); that name is no longer generated, so a repo still referencing `catalog:<name>Peers` must switch to `catalog:<name>:peers`.

## Deriving peer allowedVersions from a catalog

`peerDependencyRules.allowedVersionsFromCatalogs` derives version-qualified `peerDependencyRules.allowedVersions` rules from a catalog, so you do not hand-maintain a rule per package. It is a build-time directive: the plugin resolves it, folds the result into `allowedVersions` and bakes it into the emitted pnpmfile, so it applies through both the runtime hook and `rolldown-pnpm-config export`.

```ts
peerDependencyRules: {
  allowedVersionsFromCatalogs: { catalog: "effect", peer: "effect", prefix: null },
  // or an array of directives to merge rules from several catalogs
}
```

For every exact-pinned entry in `catalog` (other than `peer` itself) it emits a qualified rule `"<name>@<pin>><peer>": <peerValue>`, where `<peerValue>` is the `peer` package's own catalog range. pnpm applies each qualified rule only when the parent instance's version matches the exact pin, so a same-named satellite on a different version line keeps its real unmet-peer complaint. `prefix` transforms the value: omit it to use the peer range verbatim, set `"^"` / `">="` (etc.) to re-prefix, or set `null` / `""` to strip to an exact version. Non-exact entries are skipped rather than widened, and a manually authored `allowedVersions` entry wins on a key clash.

## Deriving overrides from a catalog

`overridesFromCatalogs` derives pnpm `overrides` from a catalog, so every member of a release family resolves to the catalog's exact version everywhere in a consumer's graph. A catalog range alone cannot promise that: a caret admits a newer member, and a catalog never reaches a dependency's own dependencies, so a package that depends on one member directly can pull in a version the rest of the family was not built against. Like the peer directive above, it is resolved at build time and baked into the emitted pnpmfile, so it applies through the runtime hook, `rolldown-pnpm-config export` and `preview`.

```ts
overridesFromCatalogs: { catalog: "effect", exclude: ["@effect/tsgo"] },
// or an array of directives to pin members from several catalogs
```

For every member whose range is a simple operator on a plain `X.Y.Z` version it emits `"<name>@^X.0.0": "X.Y.Z"` (`^0.Y.0` on a 0.x line, `~0.0.0` on a 0.0.x one, since `^0.0.0` admits nothing but itself), so only requests on that release line are pinned and a tool still built on another line keeps its own copy. Set `scope: "any"` to emit the bare package name instead and pin every request regardless of line. Prerelease and compound-range members are skipped rather than widened, `exclude` drops members that ride the catalog without belonging to the family, and an entry authored by hand under `overrides` wins on the same selector. When the pinned version is missing from the registry the install fails loudly at resolve time instead of silently pairing a newer member with an older core.

## Enforcement: absent, warn, error

When the hook merges your config into a consuming repo, the repo may already declare a value that diverges from yours. Each managed field decides what happens when it does, through one of three enforcement levels:

- `absent` — merge silently. The divergence is allowed and nothing is printed.
- `warn` — merge but print a warning box describing the divergence.
- `error` — fail the install. The divergence is rejected and pnpm stops.

The base rule is that the child config wins: a consuming repo can override a managed value. Enforcement governs how loud that override is. A repo on `warn` keeps its own value and sees a notice; a repo on `error` cannot diverge at all.

Divergences come in two kinds, which drive two separate warning boxes. An override divergence is a plain value mismatch — the repo set something different from the managed default. A security divergence is a value mismatch on a security-relevant field, such as a weakened `minimumReleaseAge` or a loosened build allowlist; it gets its own box so it stands out from routine overrides.

## Where to go deeper

For the internals — the strategy engine, the field registry, the build-time `freeze` step and the build-to-runtime emit pipeline — see the knowledge bundle at [`okf/`](../okf): [`okf/modules/`](../okf/modules) for each subsystem's boundary, [`okf/decisions/`](../okf/decisions) for why it is shaped that way, and [`okf/glossary/`](../okf/glossary) for the vocabulary used throughout.
