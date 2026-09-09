# Module

* [CLI](cli.md) - The developer-facing rolldown-pnpm-config binary — upgrade, export and preview commands plus the shared diff/render layer.
* [Descriptor table](descriptors.md) - The declarative table of 121 managed pnpm fields, the single source of truth the schemas and strategy registry derive from.
* [Patches](patches.md) - Build/CLI-side patch discovery and path rewrite so a plugin author can distribute pnpm dependency patches.
* [Plugin engine](plugin-engine.md) - The build-time engine — PnpmConfigPlugin, the memoized freeze step, and virtual-module serialization.
* [Runtime](runtime.md) - The zero-dependency pnpmfile runtime — createHooks, the strategy table, and enforcement.
