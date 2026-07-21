---
"rolldown-pnpm-config": minor
---

## Features

### Colon-delimited peer catalogs

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

## Bug Fixes

* The interactive Ink runners (`preview` and `upgrade`) no longer hang the Effect fiber when the renderer crashes. A rejected `waitUntilExit()` now resumes with a defect so the fiber fails cleanly instead of suspending forever.
