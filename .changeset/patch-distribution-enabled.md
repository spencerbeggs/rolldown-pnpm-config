---
"rolldown-pnpm-config": minor
---

## Features

### Distributed Dependency Patches

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

- `public/patches/` — patches to distribute; discovered at build time and bundled into the shipped pnpmfile
- `patches/` — local-only patches; never discovered or distributed

Projects with no `public/patches/` directory are unaffected — build-time discovery is a no-op and the plugin config passes through unchanged.

### Export Warnings

`rolldown-pnpm-config export` now emits stale-entry and key-mismatch diagnostics for `patchedDependencies` to stderr when the local merge state diverges from the distributed set.

### Type Changes

`LocalDirective.strategy` gains `"merge"` and `"rewrite"` as valid values (additive widening, backward compatible).
