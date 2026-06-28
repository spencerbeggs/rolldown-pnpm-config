---
"rolldown-pnpm-config": minor
---

## Features

### `interop` catalog peer strategy

A third `strategy` value for catalog package entries. Where `"lock"` and `"lock-minor"` freeze ranges, `"interop"` is designed for groups of interrelated packages that declare each other as peers — the `@effect` ecosystem is the primary motivating case.

When `strategy: "interop"` is set on catalog members, `upgrade` reconciles the chosen versions against their cross-`peerDependencies`:

- Dependents are downgraded to satisfy a peer target's declared floor; peer targets are never raised to satisfy a dependent.
- Each member's materialized `peer` range is set to `^<lowest floor any member declares>`.
- With `--yes`, reconciliation applies automatically and unresolvable conflicts are reported without interrupting the run.
- In interactive mode, adjusted members re-enter the walk so the author can accept a downgrade or raise the anchor version instead.

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

### `minimumReleaseAge` honored during upgrades

`upgrade` now enforces `minimumReleaseAge` when selecting candidate versions. No upgrade path will propose a package version younger than the effective release-age gate — matching the guard pnpm applies during install.

The effective gate is the strictest of the `minimumReleaseAge` declared in your `PnpmConfigPlugin` config and the value pnpm resolves from its own settings. Exempt-package patterns from both sources are unioned, so a package listed in either set bypasses the gate.
