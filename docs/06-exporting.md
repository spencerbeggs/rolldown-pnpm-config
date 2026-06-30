# Exporting to pnpm-workspace.yaml

`rolldown-pnpm-config export` materializes the managed plugin config directly into the consuming repo's `pnpm-workspace.yaml`. It is the path for repos that develop or dogfood the plugin itself and cannot consume it as a config dependency.

## The command

```bash
npx rolldown-pnpm-config export [path]
# Exported to /path/to/pnpm-workspace.yaml
```

With no `path` argument the command finds the nearest `pnpm-workspace.yaml` walking up from the current directory. The optional path argument points at a specific file.

The export command normalizes the file: it parses the existing YAML, merges the managed config in, sorts keys alphabetically and sorts array fields lexicographically, then re-emits the whole file. Comments are not preserved. Fields and catalogs the plugin does not manage are left untouched.

## Previewing changes before writing

Pass `--dry-run` to print a colored canonical diff to stdout without writing the file:

```bash
npx rolldown-pnpm-config export --dry-run
# /path/to/pnpm-workspace.yaml (dry run — not written)
#
# + added  ~ changed  - removed   (local) local override  (unmanaged) not managed
```

By default the diff collapses unchanged context lines. Pass `--full` alongside `--dry-run` to emit the entire canonical tree:

```bash
npx rolldown-pnpm-config export --dry-run --full
# example output (varies by environment)
```

## The preview command

`rolldown-pnpm-config preview` opens an interactive tabbed explorer without writing anything:

```bash
npx rolldown-pnpm-config preview [path]
# interactive ink-tab explorer (Changes / Full / Simulated) in a TTY
# non-TTY: prints the Changes diff and exits
```

The explorer has three tabs:

- **Changes** — the diff between the current file and what export would write, with context collapsing.
- **Full** — the same diff with every line shown.
- **Simulated** — the diff a fresh consuming repo would see: no local overrides applied, showing what the managed config contributes on its own.

In a non-interactive terminal (CI, piped output) the `preview` command falls back to printing the Changes diff and exiting — it never hangs.

## What export preserves

The export does not delete catalogs or fields it does not manage. Within managed fields, `overrides` entries whose value starts with `file:`, `link:`, `workspace:` or `portal:` are copied back from the existing file on every run. This preserves local path references and workspace links that the consuming repo added and the managed config has no opinion on. The default preserve list is `["file", "link", "workspace", "portal"]` — it applies even when no `local.overrides` directive is set.

## The `local` field

The optional `local` field on `PluginConfig` lets you adjust what the export writes for this repo without affecting the built pnpmfile or any other consumer. It is export-time only — `freeze`, the virtual pnpmfile module and the bundled runtime are all unaffected.

Each entry in `local` is either a bare value (which overwrites the managed value) or a directive object `{ preserve?, value?, strategy? }`:

| Form | Effect |
| ---- | ------ |
| bare value | Overwrites the managed value entirely. |
| `{ value }` | Overwrites the managed value entirely. |
| `{ strategy: "union", value }` | Record merge (value wins on key clash) or array set-union. |
| `{ strategy: "difference", value }` | Remove keys in `value` from the managed record, or remove elements from the managed array. |
| `{ preserve: [...protocols] }` | For `overrides` only: copy back entries from the existing file whose value starts with a listed protocol prefix. Overrides the default `["file","link","workspace","portal"]` list. |

A full example:

```ts
export const plugin = {
  name: "@acme/pnpm-config",
  overrides: { "tar@<6.2.1": ">=6.2.1" },
  publicHoistPattern: ["@types/*", "@acme/cli"],
  local: {
    // add local patterns on top of the managed list
    publicHoistPattern: { strategy: "union", value: ["@acme/dev-tools"] },
    // remove one managed override entry that this repo does not need
    overrides: { strategy: "difference", value: { "tar@<6.2.1": ">=6.2.1" } },
    // overwrite a field entirely for this repo
    strictDepBuilds: false,
  },
} satisfies PluginConfig;
```

## excludeByRepo

`publicHoistPattern` accepts an `excludeByRepo` map keyed by consuming-repo name (the `name` field from the root `package.json` of the repo where the config runs). On each export the plugin reads the consuming repo's `package.json` name and drops the listed patterns from `publicHoistPattern` before writing.

```ts
publicHoistPattern: {
  value: ["@types/*", "@acme/cli", "@acme/mcp"],
  excludeByRepo: {
    // in consumer-a, drop the two @acme/* entries from the hoist list
    "consumer-a": ["@acme/cli", "@acme/mcp"],
  },
}
```

`excludeByRepo` is applied before any `local` directive for the field, so the effective value a `local.publicHoistPattern` union or difference merges against is already the repo-filtered list.

## Related pages

- [Getting started](./01-getting-started.md) — author the config and run the plugin build.
- [Concepts](./03-concepts.md) — the enforcement model and catalog semantics.
- [Upgrading catalogs](./05-upgrading-catalogs.md) — the `upgrade` CLI.
