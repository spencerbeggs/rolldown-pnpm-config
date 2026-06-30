# rolldown-pnpm-config

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
