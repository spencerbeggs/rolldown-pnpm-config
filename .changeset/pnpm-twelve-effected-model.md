---
"rolldown-pnpm-config": major
---

## Breaking Changes

The plugin now models pnpm 12 settings through `@effected/pnpm` instead of its own descriptors. Configs that relied on settings or shapes pnpm 12 does not honour are refused at build time rather than shipping a value that does nothing.

### Removed options

Thirteen options are gone: `allowNonAppliedPatches`, `ignoreDepScripts`, `ignorePatchFailures`, `managePackageManagerVersions`, `packageManagerStrict`, `packageManagerStrictVersion`, `useNodeVersion`, `onlyBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, `executionEnv` and `confirmModulesPurge`. pnpm 12 either never reads them or never applies them.

A config that still names one fails the build with a hint toward the replacement, for example:

```text
`onlyBuiltDependencies` is not a pnpm 12 setting: pnpm 12 never applies it; use allowBuilds
```

Migrate built-dependency policy to `allowBuilds`, and `executionEnv` to `devEngines.runtime`.

### Shapes follow pnpm 12

* `auditConfig` accepts only `{ ignoreGhsas }`; any other key (`ignoreCves`, `os`, and so on) is rejected, and the error points you to `audit.ignore`. A closed shape refuses excess keys, so a typo fails the build instead of vanishing.
* `updateConfig` failures point you to `update`.
* `packageExtensions` entries must be objects, `nodeDownloadMirrors` values must be strings, `overrides` keys must be selectors pnpm can parse, and `peerDependencyRules` must be well formed.
* The numeric settings reject fractional values, and negative values except `childConcurrency` and `workspaceConcurrency`.
* `supportedArchitectures` is a closed `{ os, cpu, libc }` shape.
* Newly accepted: `nodeLinker: "loaded"` (and `{ type: "loaded", excluded }`), object forms of `lockfile` and `sideEffectsCache`, non-boolean `allowBuilds` values, any string for `savePrefix`, and `"true"` / `"false"` for `verifyDepsBeforeRun`.
* `updateConfig` gains `changeset`, `githubActions` and `githubActionsServer`.
* Coerced values ship in the form pnpm reads: a word such as `yes` for a boolean setting ships as `true`, and a digit string for a numeric setting ships as a number.
* A hand-authored `overrides` selector spelled differently from a derived one now wins over it, and the catalog pin follows the authored value.

### Unmanaged pnpm 12 settings are refused

A pnpm 12 setting this plugin has no policy for (for example `registry`) now fails the build with "is a pnpm 12 setting this plugin does not manage" instead of being silently dropped. Keys that are not pnpm settings at all are still ignored.

### CLI registry reads follow pnpm 12's configuration

`upgrade` and the other registry-reading commands no longer shell out to `pnpm view`. They read the registry through `NpmRegistry` using pnpm 12's own configuration: `registry`, `registries` and proxy keys in `pnpm-workspace.yaml`, the global `config.yaml`, `pnpm_config_*` environment variables, then the npmrc proxy and TLS settings, in pnpm's precedence. `npm_config_*` settings (other than credentials) and npm's global `etc/npmrc` no longer apply, and a registry URL containing a `${VAR}` placeholder in a repository file fails the run.

`upgrade` now fails with the real cause instead of misleading output:

* An unreadable registry configuration fails once with `Cannot read the registry configuration: <cause>` rather than listing every package as a possible typo.
* A package whose registry answer carries no publish times is reported with `publish times unavailable for <pkg>: the registry lists none`. Previously its versions were withheld silently under a release-age gate.
* An unknown package reports `<pkg> is not on the registry`, and the typo or auth advice is shown only where it applies.
* The release-age gate reads `minimumReleaseAge` through the same schema as the build, so `"1440"` gates at 1440.

## Features

### `audit` and `update` settings

The plugin now manages pnpm 12's `audit` and `update` settings. List keys (`audit.ignore`, `update.ignoreDeps`) are merged with the managed list, deduplicated and sorted, so a consumer's entries add to the managed ones. Scalar keys (`audit.level`, `audit.ignorePrune`, `update.changeset`, `update.githubActions`, `update.githubActionsServer`) take the consumer's value when set.

The deprecated `updateConfig` keeps replace semantics: a consumer's value replaces the managed one. Prefer `update`, which merges.

### Settings catalog from `@effected/pnpm`

The catalog of managed settings, their shapes and their validation messages now come from `@effected/pnpm` (pnpm 12.20.0), and `pnpm-workspace.yaml` edits go through its workspace file editor. Rendered output for existing configs is unchanged.

## Dependencies

The package now depends on `@effected/pnpm` and requires the effected kit released with `pnpm-plugin-effected` 0.26.5.

| Dependency | Type | Action | From | To |
| :--------- | :--- | :----- | :--- | :-- |
| @effected/pnpm | dependency | added | — | 0.1.0 |
