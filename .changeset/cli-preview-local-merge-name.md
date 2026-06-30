---
"rolldown-pnpm-config": minor
---

## Breaking Changes

- `PnpmConfigPlugin({...})` now requires a top-level `name` — a string identifying the config, conventionally its package name. A missing `name` fails the build.
- The `createHooks(base, manifest)` runtime export now takes a third argument: `createHooks(base, manifest, name)`.

## Features

- New `rolldown-pnpm-config preview` command: an interactive explorer of how `pnpm-workspace.yaml` would change, with Changes, Full, and Simulated (fresh-consumer) tabs. Falls back to a static colored diff in a non-interactive terminal.
- `rolldown-pnpm-config export --dry-run [--full]` prints a colored, canonical diff without writing (this replaces the removed `export --preview` flag).
- `local.<field>` accepts a merge directive — `{ preserve?, value?, strategy?: "union" | "difference" }` — for `overrides` and `publicHoistPattern`, alongside the bare-value (overwrite) form. A new `LocalDirective<T>` type is exported, and `publicHoistPattern.excludeByRepo` (keyed by the consuming repo's `package.json` name) is now applied automatically on export.
- `rolldown-pnpm-config upgrade` gained colorized output, `--preview` (a non-interactive projection) and `--full`, plus a non-interactive fallback so it never hangs.
- Runtime override and security warnings are now generic and tagged with the emitting config's `[name]`.

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

## Bug Fixes

- `export` no longer deletes local-protocol overrides (`file:` / `link:` / `workspace:` / `portal:`) that already exist in `pnpm-workspace.yaml`.
- `excludeByRepo` resolves the consuming repo from the `pnpm-workspace.yaml` directory, so it works even when `export` is run from a subdirectory.
