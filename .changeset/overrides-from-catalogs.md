---
"rolldown-pnpm-config": minor
---

## Features

### `overridesFromCatalogs`

A build-time directive beside `overrides` that pins every member of a catalog to its exact catalog version across the whole consumer graph. For each member on a simple range it emits `"<name>@^X.0.0": "X.Y.Z"` (`^0.Y.0` on a 0.x line), so direct, transitive and peer requests on that release line all resolve to the one version the family was built against, while a tool on another line keeps its own copy. `exclude` drops members that ride the catalog without belonging to the family, `scope: "any"` emits bare selectors, prerelease and compound-range members are skipped rather than widened, and an authored `overrides` entry wins on a selector clash. Resolved in `freeze`, so the pnpmfile, `export` and `preview` all carry the result.

```ts
PnpmConfigPlugin({
	catalogs: { effect: { packages: { effect: "^4.0.3", "@effect/vitest": "^4.0.3" } } },
	overridesFromCatalogs: { catalog: "effect" },
	// → overrides: { "effect@^4.0.0": "4.0.3", "@effect/vitest@^4.0.0": "4.0.3" }
});
```

A catalog range alone cannot give this guarantee: a caret admits a newer member, and a catalog never reaches a dependency's own dependencies. A family whose satellites publish before its core now fails loudly at resolve time instead of pairing the new satellites with the old core and dying at import.
