---
"rolldown-pnpm-config": minor
---

## Features

Added a `rolldown-pnpm-config export [path]` command that materializes the
plugin's managed config into the local `pnpm-workspace.yaml` — the catalogs and
pnpm settings the plugin would otherwise inject at install time, written
directly into the workspace file. The plugin is authoritative for the fields it
manages (config-only fields like `confirmModulesPurge` are skipped); unknown
keys and local-only catalogs are preserved; and a new export-only `local` key on
`PnpmConfigPlugin` overrides settings for the local export. Pass `--preview` to
print the result without writing. This lets a repo that develops the plugin (and
cannot consume it as a config dependency) test the exact catalogs and ranges
downstream consumers will receive.
