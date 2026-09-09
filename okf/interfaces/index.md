# Interface

* [Catalog entry, peer strategy, and version source](catalog-peer-strategy.md) - The catalog package spec shape an author writes, the PeerStrategy/VersionSource authoring fields, and the colon-only <name>:peers materialized catalog naming.
* [LocalDirective](local-directive.md) - The per-field export-time override contract authors write under `local` in a `PnpmConfigPlugin({...})` call.
* [Managed pnpm fields](managed-pnpm-fields.md) - The 121 pnpm settings fields this library manages, grouped by category, plus the keys deliberately excluded from coverage.
* [PnpmConfigPlugin authoring surface](plugin-config.md) - The single canonical, statically analyzable PnpmConfigPlugin({...}) call a plugin author writes against.
* [StyledLine](styled-line.md) - The shared render-layer contract for colored CLI output across export, preview, and upgrade.
* [Virtual module specifiers](virtual-modules.md) - The two virtual module specifiers PnpmConfigPlugin serves and the ambient types a consumer opts into to type-check imports from them.
* [export and preview commands](export-preview-commands.md) - The consumer-facing contract of `rolldown-pnpm-config export [path]` and `rolldown-pnpm-config preview [path]`.
* [patch distribution](patch-distribution.md) - The authoring convention a plugin uses to distribute pnpm dependency patches through its config-dependency package.
* [upgrade command](upgrade-command.md) - The consumer-facing contract of `rolldown-pnpm-config upgrade [file]`.
* [{ base, manifest, name } contract](base-manifest-name.md) - The plain-data payload that crosses from build time into the bundled zero-dependency runtime.
