# rolldown-pnpm-config

## 0.5.1

### Refactoring

* The upgrade CLI's release-age gate now comes from `@effected/npm`'s `ReleaseAgeGate` instead of an internal copy, so one implementation serves every consumer. Behavior is unchanged: strictest age wins, exclude patterns keep pnpm's `@pnpm/matcher` (`*` crosses `/`) semantics, and too-young or timestamp-less versions are dropped. The two config readers (`readConfigReleaseAge`, `parsePnpmGate`) stay local and feed their partial gates into `ReleaseAgeGate.combine`.

### Dependencies

* | Dependency    | Type       | Action | From | To     |                                                                     |
  | :------------ | :--------- | :----- | :--- | :----- | ------------------------------------------------------------------- |
  | @effected/npm | dependency | added  | —    | ^0.3.0 | [#46][#46] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

[#46]: https://github.com/spencerbeggs/rolldown-pnpm-config/pull/46

## 0.5.0

### Features

* ### Colon-delimited peer catalogs

  Materialized peer catalogs are now emitted under `<name>:peers` (colon-delimited, preferred) in addition to the legacy `<name>Peers` (camelCase). Both point at the same map during this transition; the camelCase form will be removed in a later release.

  ### `peerDependencyRules.allowedVersionsFromCatalogs`

  New authoring directive that derives version-qualified `peerDependencyRules.allowedVersions` rules from a catalog, resolved and baked in at build time — so it applies via both the pnpmfile and `export`. This replaces an external generator script consumers previously had to run by hand.

  ```ts
  PnpmConfigPlugin({
  	catalogs: {
  		effect: {
  			packages: {
  				effect: { range: "4.0.0-beta.99", peer: "4.0.0-beta.99", strategy: "lock" },
  				"@effect/platform-node": { range: "4.0.0-beta.99", peer: "4.0.0-beta.99", strategy: "lock" },
  			},
  		},
  	},
  	peerDependencyRules: {
  		allowedVersionsFromCatalogs: { catalog: "effect", peer: "effect", prefix: "^" },
  	},
  });
  ```

  For each exactly-pinned entry in the catalog, this emits a rule of the form `"<name>@<pin>><peer>"` valued at the peer's own catalog version (optionally re-prefixed via `prefix`), so a satellite package pinned against a fast-moving prerelease line stops warning about an unmet peer — without masking a genuinely unmet range on a different version line. A manually authored `allowedVersions` entry always wins over a derived one on a key clash.

  ### `preview` command improvements

  * Added a color legend explaining the `merge`/`overwrite`/`warn`/`error` annotations.
  * The Simulated tab now renders the calculated fresh-consumer config as a plain annotated listing (per-field `merge`/`overwrite` plus `· warn`/`· error` markers) instead of a diff; unmanaged lines get a distinct gray, and the redundant `(unmanaged)` tag is dropped when color is enabled.
  * Enter now exits the preview, in addition to the existing exit key.

  ### `upgrade` interactive table improvements

  * The table now shows every discovered catalog row, including up-to-date rows as non-selectable context — the cursor starts on the first actionable row.
  * A new `minor` upgrade tier surfaces intermediate versions for 0.x packages (e.g. `0.50.0` between a `^0.49.0` caret and the next major).
  * For interop catalogs, the peer column shows a live group-derived floor and flags conflicting picks with `⚠`; long conflict annotations are truncated to fit.

  ### Interop write path honors picks directly

  The interactive walk now applies the user's final version picks and the live-derived peer floors directly and reports any remaining conflicts, rather than running a post-walk auto-downgrade/re-prompt loop. `--yes` and CI behavior are unchanged — they still auto-reconcile.

### Bug Fixes

* The interactive Ink runners (`preview` and `upgrade`) no longer hang the Effect fiber when the renderer crashes. A rejected `waitUntilExit()` now resumes with a defect so the fiber fails cleanly instead of suspending forever. [#42][#42]

### Dependencies

* | Dependency       | Type       | Action  | From   | To     |                                                                     |
  | ---------------- | ---------- | ------- | ------ | ------ | ------------------------------------------------------------------- |
  | @effected/semver | dependency | updated | ^0.1.0 | ^0.2.0 |                                                                     |
  | @effected/yaml   | dependency | updated | ^0.3.1 | ^0.5.0 | [#42][#42] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#42]: https://github.com/spencerbeggs/rolldown-pnpm-config/pull/42

## 0.4.1

### Dependencies

* | Dependency     | Type       | Action  | From   | To     |                                                          |
  | -------------- | ---------- | ------- | ------ | ------ | -------------------------------------------------------- |
  | @effected/yaml | dependency | updated | ^0.3.0 | ^0.3.1 | Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

## 0.4.0

### Features

* Migrated the runtime dependency stack from Effect v3 to Effect v4 (`effect` and `@effect/platform-node` now resolve via `catalog:effect`). The entire v3 satellite closure — `@effect/cli`, `@effect/cluster`, `@effect/experimental`, `@effect/platform`, `@effect/printer`, `@effect/printer-ansi`, `@effect/rpc`, `@effect/sql`, `@effect/typeclass`, `@effect/workflow` — is no longer part of the published dependency tree, since v4 folds that functionality into `effect` itself and `@effect/platform-node` v4 peers only on `effect`. Consumers get a substantially smaller dependency tree on install.
* Replaced `yaml` with `@effected/yaml` and `semver-effect` with `@effected/semver` — drop-in replacements for the surface this package uses.

### Bug Fixes

* Fixed an `ae-wrong-input-file-type` API Extractor diagnostic by making `virtual.d.ts` self-contained — the `PnpmHooks`/`PnpmConfig` shape is now inlined instead of imported from the package's own runtime types, which previously pulled a raw `.ts` file into the declaration-file analysis pass [#35][#35]

### Refactoring

* CLI command parsing was ported from the now-unmaintained `@effect/cli` to `effect/unstable/cli`, and process spawning moved to `effect/unstable/process`. Commands, flags, and output are unchanged — this is an internal migration only.

### Dependencies

* | Dependency            | Type       | Action  | From         | To             |                                                                     |
  | --------------------- | ---------- | ------- | ------------ | -------------- | ------------------------------------------------------------------- |
  | @effect/cli           | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/cluster       | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/experimental  | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/platform      | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/printer       | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/printer-ansi  | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/rpc           | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/sql           | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/typeclass     | dependency | removed | catalog:silk | —              |                                                                     |
  | @effect/workflow      | dependency | removed | catalog:silk | —              |                                                                     |
  | semver-effect         | dependency | removed | ^0.3.1       | —              |                                                                     |
  | yaml                  | dependency | removed | ^2.9.0       | —              |                                                                     |
  | @effect/platform-node | dependency | updated | catalog:silk | catalog:effect |                                                                     |
  | effect                | dependency | updated | catalog:silk | catalog:effect |                                                                     |
  | @effected/semver      | dependency | added   | —            | ^0.1.0         |                                                                     |
  | @effected/yaml        | dependency | added   | —            | ^0.1.0         | [#35][#35] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#35]: https://github.com/spencerbeggs/rolldown-pnpm-config/pull/35

## 0.3.0

### Features

* ### Prerelease catalog entries can upgrade again

  A catalog entry pinned to a prerelease line (for example `^3.0.0-next.8`) is no longer frozen forever. `upgrade` now offers newer prereleases on the same named track (`next.9`, `next.10`, ...) alongside the eventual stable release, so you can advance a prerelease pin without hand-editing the config. Entries on a stable range are unaffected — they never see a prerelease candidate.

  ### Interactive upgrade table

  The interactive walk is now a single table showing every catalog package at once, grouped by catalog, modelled on `pnpm up -i`. Each row is a radio group over that package's available versions with the current value preselected: `↑↓` moves between rows, `←→` selects within a row, `⏎` applies, `Esc` cancels. Up-to-date rows are hidden by default — pass `--full` to see every package, including ones with nothing to change. Because every row defaults to "keep" and there's no select-all, running the table and doing nothing is always a no-op, and a major version bump is only applied by deliberately selecting it. The confirmation summary mirrors the same table, colored to show what changed.

  ### Upgrade validation against the registry

  Before writing any range or peer, `upgrade` now checks that at least one published version actually satisfies it — satisfiability, not exact-version existence, so a `lock-minor` floor like `^3.4.0` still passes when only `3.4.1` shipped. Rejection is atomic per package: if either half of a package's range/peer pair fails validation, both are dropped rather than writing a bumped range next to a stale peer. In interactive mode a rejected change is dropped and reported in the summary so the rest of your upgrade still applies; `--yes` fails the run entirely (writing nothing) if any change would be unsatisfiable or if a peer strategy is incompatible with a pinned prerelease, since an unattended CI run has no chance to notice and fix a warning. [#32][#32]

### Bug Fixes

* ### Prerelease peers no longer rewrite to an unpublished version

  `upgrade` no longer rewrites a `peer` range on a prerelease-pinned catalog entry to a version that was never published. A `strategy: "lock"` entry pinned to `^3.0.0-next.8` previously had its peer rewritten to `^3.0.0` on every run — even when you explicitly chose *keep* — because the derivation reconstructed the version from its parsed parts and silently dropped the prerelease tag. The derived peer now reuses the pinned version verbatim, so prerelease and build identifiers survive.

  `lock-minor` on a prerelease pin (where flooring the patch would exclude the very version being catalogued) now degrades to a `lock`-style pin instead and surfaces a warning that the strategy is incompatible with the pinned line, rather than silently writing an unsatisfiable range.

  ### Unresolvable catalog packages are now surfaced instead of hidden

  A package name the registry can't resolve — a typo, a 404, an auth failure — used to be swallowed to an empty version list, silently counted as "up to date," and hidden from the upgrade table entirely. `upgrade` now reports it explicitly (`Could not resolve N package(s) from the registry — check the name(s) for typos, or your registry auth`) so a bad name doesn't go unnoticed.

  ### `--dry-run` now matches what an apply would do

  `--dry-run` runs the identical interactive flow — resolve, plan, validate, and the full radio-group table — and skips only the write. It previously short-circuited before the table and showed auto-picked defaults you never chose, skipping the same reconcile step a real run performs, so the "preview" didn't reflect what applying would actually do. `--dry-run` also now composes correctly with `--yes`: `--yes --dry-run` previously wrote the file anyway.

### Minor Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#32]: https://github.com/spencerbeggs/rolldown-pnpm-config/pull/32

## 0.2.2

### Dependencies

* | Dependency | Type           | Action  | From   | To     |                                                          |
  | ---------- | -------------- | ------- | ------ | ------ | -------------------------------------------------------- |
  | rolldown   | peerDependency | updated | ^1.0.0 | ^1.1.0 | Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

## 0.2.1

### Bug Fixes

* Declared the full `effect` v3 peer closure of `@effect/platform-node` and `@effect/cli` as regular dependencies (`@effect/cluster`, `@effect/experimental`, `@effect/printer`, `@effect/printer-ansi`, `@effect/rpc`, `@effect/sql`, `@effect/typeclass`, `@effect/workflow`) instead of relying on pnpm's `autoInstallPeers` to resolve them from the consumer's workspace. Previously, a consumer with `effect` v4 installed anywhere else in their workspace could poison this package's `effect` v3 peer resolution and crash it at load. No API changes — the dependency tree is now self-contained.

### Dependencies

* | Dependency           | Type       | Action  | From     | To       |                                                                     |
  | -------------------- | ---------- | ------- | -------- | -------- | ------------------------------------------------------------------- |
  | oxc-parser           | dependency | updated | ^0.137.0 | ^0.138.0 |                                                                     |
  | semver-effect        | dependency | updated | ^0.2.1   | ^0.3.1   |                                                                     |
  | std-osc8             | dependency | updated | ^0.1.0   | ^0.2.0   |                                                                     |
  | @effect/cluster      | dependency | added   | —        | ^0.59.0  |                                                                     |
  | @effect/experimental | dependency | added   | —        | ^0.60.0  |                                                                     |
  | @effect/printer      | dependency | added   | —        | ^0.49.0  |                                                                     |
  | @effect/printer-ansi | dependency | added   | —        | ^0.49.0  |                                                                     |
  | @effect/rpc          | dependency | added   | —        | ^0.75.1  |                                                                     |
  | @effect/sql          | dependency | added   | —        | ^0.51.1  |                                                                     |
  | @effect/typeclass    | dependency | added   | —        | ^0.40.0  |                                                                     |
  | @effect/workflow     | dependency | added   | —        | ^0.18.2  | [#23][#23] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

[#23]: https://github.com/spencerbeggs/rolldown-pnpm-config/pull/23

## 0.2.0

### Features

* [`5dcc988`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/5dcc988974b23b657b5a071baab4a0dddc49d67b) ### Distributed Dependency Patches

Plugin authors can now bundle `.patch` files with their config-dependency plugin and have them applied automatically in every consumer project — no per-consumer `patchedDependencies` registration required.

Place patch files under `public/patches/` in the plugin source tree. At build time, the plugin discovers those files, rewrites each path to `node_modules/.pnpm-config/<name>/patches/<file>.patch` in the consumer's project, and injects the registrations into the shipped pnpmfile via `updateConfig`. Consumers receive the patches on install without any manual configuration.

```ts
// rolldown.config.ts (plugin author)
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

export default PnpmConfigPlugin({
  name: "my-config-plugin",

  // Distribute patches from public/patches/ (auto-detected when the folder exists)
  patchedDependencies: {
    strategy: "rewrite",
  },

  // Control how the local export merges distributed patches with the repo's own
  local: {
    patchedDependencies: {
      strategy: "merge", // default — sibling plugins and repo patches are preserved
    },
    localPatchesDir: "custom-patches/", // override source root (default: public/patches/)
  },
});
```

Ownership is scoped by plugin `name`, so multiple config-dependency plugins and the consuming repo's own `patchedDependencies` coexist without key collisions. `mapChildWins` reconciles local-vs-distributed entries at install time.

### Folder Convention

Two directories establish clear ownership boundaries:

* `public/patches/` — patches to distribute; discovered at build time and bundled into the shipped pnpmfile
* `patches/` — local-only patches; never discovered or distributed

Projects with no `public/patches/` directory are unaffected — build-time discovery is a no-op and the plugin config passes through unchanged.

### Export Warnings

`rolldown-pnpm-config export` now emits stale-entry and key-mismatch diagnostics for `patchedDependencies` to stderr when the local merge state diverges from the distributed set.

### Type Changes

`LocalDirective.strategy` gains `"merge"` and `"rewrite"` as valid values (additive widening, backward compatible).

## 0.1.0

### Breaking Changes

* [`56cc7e3`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/56cc7e37f92a85e644dea5826db3ef4320a00d75) `PnpmConfigPlugin({...})` now requires a top-level `name` — a string identifying the config, conventionally its package name. A missing `name` fails the build.
* The `createHooks(base, manifest)` runtime export now takes a third argument: `createHooks(base, manifest, name)`.

### Features

* [`56cc7e3`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/56cc7e37f92a85e644dea5826db3ef4320a00d75) New `rolldown-pnpm-config preview` command: an interactive explorer of how `pnpm-workspace.yaml` would change, with Changes, Full, and Simulated (fresh-consumer) tabs. Falls back to a static colored diff in a non-interactive terminal.
* `rolldown-pnpm-config export --dry-run [--full]` prints a colored, canonical diff without writing (this replaces the removed `export --preview` flag).
* `local.<field>` accepts a merge directive — `{ preserve?, value?, strategy?: "union" | "difference" }` — for `overrides` and `publicHoistPattern`, alongside the bare-value (overwrite) form. A new `LocalDirective<T>` type is exported, and `publicHoistPattern.excludeByRepo` (keyed by the consuming repo's `package.json` name) is now applied automatically on export.
* `rolldown-pnpm-config upgrade` gained colorized output, `--preview` (a non-interactive projection) and `--full`, plus a non-interactive fallback so it never hangs.
* Runtime override and security warnings are now generic and tagged with the emitting config's `[name]`.

```ts
PnpmConfigPlugin({
  name: "@acme/pnpm-config",
  catalogs: { default: { packages: { typescript: "^5.9.0" } } },
  local: {
    // drop an internal override locally; keep everything else managed
    overrides: { strategy: "difference", value: { "@acme/internal": "*" } },
  },
});
```

* [`d128a68`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/d128a68aa5d2c082546d807f56cfd06a147b24d7) ### `interop` catalog peer strategy

A third `strategy` value for catalog package entries. Where `"lock"` and `"lock-minor"` freeze ranges, `"interop"` is designed for groups of interrelated packages that declare each other as peers — the `@effect` ecosystem is the primary motivating case.

* [`e7594a6`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/e7594a6df54c699fefe3f703e33d6a82de846d1e) Fixed interactive `upgrade` with `interop` catalog strategy hanging at the peer-reconcile step. `runInterop` previously eagerly prefetched `peerDependencies` for the full published-version history of every interop member (up to \~10 000 registry calls for a large `@effect` group). Peer-dependency data is now fetched lazily — only the chosen ceiling version up front, with lower versions fetched on demand during a downgrade search — making the common case approximately one registry call per member. Interop resolution results are unchanged.

When `strategy: "interop"` is set on catalog members, `upgrade` reconciles the chosen versions against their cross-`peerDependencies`:

* Dependents are downgraded to satisfy a peer target's declared floor; peer targets are never raised to satisfy a dependent.
* Each member's materialized `peer` range is set to `^<lowest floor any member declares>`.
* With `--yes`, reconciliation applies automatically and unresolvable conflicts are reported without interrupting the run.
* In interactive mode, adjusted members re-enter the walk so the author can accept a downgrade or raise the anchor version instead.

```ts
// savvy.build.ts
PnpmConfigPlugin({
  catalogs: {
    effect: {
      packages: {
        effect: { range: "^3.15.0", strategy: "interop" },
        "@effect/platform": { range: "^0.80.0", strategy: "interop" },
      },
    },
  },
});
```

The public `PeerStrategy` type is widened from `"lock" | "lock-minor"` to `"lock" | "lock-minor" | "interop"`. Existing configs are unaffected.

* [`1b6093a`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/1b6093a106470edf279f2374e32a7bc24dfa7ed1) Declarative pnpm config through a single `PnpmConfigPlugin({...})` entry point. Author your catalogs and pnpm-workspace settings as one object and the build emits a self-contained `pnpmfile`. Catalogs are inline and keyed by name, with each package given a bare range or an object carrying a materialized `peer` range and an optional `strategy` (`"lock"` / `"lock-minor"`). The build reads peer ranges from source verbatim and never derives them; a `<name>Peers` catalog is generated only for packages that declare a `peer`. This replaces the former `defineCatalogs`, `definePlugin`, and catalog-level `peers: true` shape, which are removed in favor of the single inline form.

A new `rolldown-pnpm-config upgrade` command keeps catalog versions current by rewriting the version ranges in your config file in place. It locates the version literals statically (the config is never executed), resolves available versions from the registry through `pnpm` (reusing your `.npmrc`, scoped registries, and auth), and rewrites them while preserving each range's operator and never crossing a major version non-interactively.

* An interactive per-package walk (the default) to choose the latest in-range version, the latest overall version, or to keep the current one.
* `--yes` applies the latest in-range version to every package non-interactively.
* `--dry-run` prints the pending diff and writes nothing.
* `--catalog <name>` limits the run to a single catalog.
* Strategy-managed `peer` ranges are recomputed when a package is upgraded and resynced when a hand-edited range leaves them stale, and a `peer` literal is materialized for packages that declare a `strategy` but have no `peer` yet.
* The config file is autodetected when no path is given.

- [`1b6093a`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/1b6093a106470edf279f2374e32a7bc24dfa7ed1) Added a `rolldown-pnpm-config export [path]` command that materializes the
  plugin's managed config into the local `pnpm-workspace.yaml` — the catalogs and
  pnpm settings the plugin would otherwise inject at install time, written
  directly into the workspace file. The plugin is authoritative for the fields it
  manages (config-only fields like `confirmModulesPurge` are skipped); unknown
  keys and local-only catalogs are preserved; and a new export-only `local` key on
  `PnpmConfigPlugin` overrides settings for the local export. Pass `--preview` to
  print the result without writing. This lets a repo that develops the plugin (and
  cannot consume it as a config dependency) test the exact catalogs and ranges
  downstream consumers will receive.

### Bug Fixes

* [`56cc7e3`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/56cc7e37f92a85e644dea5826db3ef4320a00d75) `export` no longer deletes local-protocol overrides (`file:` / `link:` / `workspace:` / `portal:`) that already exist in `pnpm-workspace.yaml`.
* `excludeByRepo` resolves the consuming repo from the `pnpm-workspace.yaml` directory, so it works even when `export` is run from a subdirectory.

The effective gate is the strictest of the `minimumReleaseAge` declared in your `PnpmConfigPlugin` config and the value pnpm resolves from its own settings. Exempt-package patterns from both sources are unioned, so a package listed in either set bypasses the gate.

* [`2079125`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/2079125044d977bd6b0bd649459cacda8a515d06) Shared peerDeps cache across interactive `upgrade` re-entry rounds; later rounds reuse immutable `(package, version)` lookups fetched by earlier rounds instead of re-issuing `pnpm view` calls.
* Cuts re-entry latency for large interop groups — the `@effect` ecosystem in particular, where a single member can publish dozens of versions.

- [`e7594a6`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/e7594a6df54c699fefe3f703e33d6a82de846d1e) Fixed interactive `upgrade` with `interop` catalog strategy hanging at the peer-reconcile step. `runInterop` previously eagerly prefetched `peerDependencies` for the full published-version history of every interop member (up to \~10 000 registry calls for a large `@effect` group). Peer-dependency data is now fetched lazily — only the chosen ceiling version up front, with lower versions fetched on demand during a downgrade search — making the common case approximately one registry call per member. Interop resolution results are unchanged.

### Performance

* [`e7594a6`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/e7594a6df54c699fefe3f703e33d6a82de846d1e) Concurrent version resolution in `upgrade`: packages are now resolved in parallel (bounded concurrency) rather than one `pnpm view` call at a time. A \~50-package config drops from \~44 s to \~7 s.
* Live progress (`Resolved X/N`) is printed to stderr in interactive terminals so the command no longer appears to hang during resolution.

- [`2079125`](https://github.com/spencerbeggs/rolldown-pnpm-config/commit/2079125044d977bd6b0bd649459cacda8a515d06) Shared peerDeps cache across interactive `upgrade` re-entry rounds; later rounds reuse immutable `(package, version)` lookups fetched by earlier rounds instead of re-issuing `pnpm view` calls.
- Cuts re-entry latency for large interop groups — the `@effect` ecosystem in particular, where a single member can publish dozens of versions.
