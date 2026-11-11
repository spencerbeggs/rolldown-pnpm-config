---
"rolldown-pnpm-config": minor
---

## Features

### Exact catalog variant

A catalog declaration can now set `exact: true` to also emit a derived `<name>:exact` catalog. Each entry's range has its operator stripped (`^0.34.0` becomes `0.34.0`, `~4.1.3` becomes `4.1.3`), so a dependent that writes `catalog:<name>:exact` publishes an exact version that still follows the catalog. This suits tools that pin their kit dependencies exactly.

```ts
catalogs: {
	kit: {
		exact: true,
		packages: {
			"@effected/cli": "^0.34.0",
			effect: { range: ">=4.0.0 <5.0.0", exact: "4.1.3" },
			"left-pad": { range: "*", exact: false },
		},
	},
},
```

This emits `kit` unchanged, plus `kit:exact` holding `@effected/cli` at `0.34.0` and `effect` at `4.1.3`, with `left-pad` left out.

* A range that names no single version (compound, wildcard, `<` or `>`, or a tag) in an opted-in catalog fails the build with a `ConfigError`, unless its entry sets `exact` to a plain version or to `false` to leave it out of `<name>:exact`.
* An explicit `exact` on a range `upgrade` rewrites (one that already derives, or a partial like `^1.2`), or an entry `exact` in a catalog that has not set `exact: true`, also fails the build, so an `upgrade` run can never break it.
* Where `overridesFromCatalogs` pins a member, `<name>:exact` names the pinned version. A winning override that is not an exact version fails the build for a member `<name>:exact` holds, since that catalog could otherwise name a version outside the override.
* The variant is emitted everywhere catalogs go: the pnpmfile runtime, `export` and `preview`. Output for `<name>` and `<name>:peers` is unchanged.
