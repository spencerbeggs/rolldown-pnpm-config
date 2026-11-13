# Module

* [CLI](cli.md) - The developer-facing rolldown-pnpm-config binary — upgrade, export and preview commands plus the shared diff/render layer.
* [Patches](patches.md) - Build/CLI-side patch discovery and path rewrite so a plugin author can distribute pnpm dependency patches.
* [Plugin engine](plugin-engine.md) - The build-time engine — PnpmConfigPlugin, the memoized freeze step, and virtual-module serialization.
* [Runtime](runtime.md) - The zero-dependency pnpmfile runtime — createHooks, the strategy table, and enforcement.
* [Settings policy table](settings-policy.md) - The plugin's merge strategy and enforcement for each of the 110 pnpm settings it manages, laid over the pnpm 12 settings catalog from @effected/pnpm/settings.
