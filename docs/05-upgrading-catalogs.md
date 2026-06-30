# Upgrading catalogs

The `rolldown-pnpm-config upgrade` command rewrites the version ranges in your config file in place. It reads the catalog packages you authored, resolves what is published, lets you pick new ranges and writes the file back — preserving the surrounding formatting and leaving everything outside the catalogs untouched.

## The command

```bash
npx rolldown-pnpm-config upgrade [file]
```

With no `file` argument the command autodetects the config: it scans the top-level `.ts` files in the current directory and picks the single one that calls `PnpmConfigPlugin(...)` with at least one catalog package. If zero or more than one file matches, it asks you to pass a path explicitly.

```bash
npx rolldown-pnpm-config upgrade pnpm-config.ts
```

Only simple ranges are touched — a bare version or a `^`/`~` range (`5.9.0`, `^5.9.0`, `~4.0.0`). Computed values or complex ranges are skipped and reported so the command never silently rewrites something it cannot parse back.

## Interactive walk (default)

Run with no flags and the command walks every catalog package one at a time. For each one it shows the resolved candidates and you choose the range to take or keep the current one. When you finish it prints a colorized summary and applies your choices. In a non-interactive terminal (CI, piped output) the command prints the same summary and exits with instructions to run `--yes` or re-run in a TTY.

```bash
npx rolldown-pnpm-config upgrade
# walks each catalog package, then:
# Applied <n> change(s).
```

## Flags

| Flag | Effect |
| ---- | ------ |
| `--yes` | Non-interactive. Takes the latest in-range version without prompting. Never crosses a major bump. |
| `--dry-run` | Prints the planned in-range bumps without writing. Does not run interop reconciliation. |
| `--catalog <name>` | Restricts the walk to a single named catalog. |
| `--preview` | Non-interactive projection: resolves the full walk and prints the colorized summary without writing or entering interactive mode. |
| `--full` | Used with `--preview` or in non-TTY output: disables context collapsing and shows every catalog entry. |

`--yes` is the unattended path — useful in scripts or a scheduled job:

```bash
npx rolldown-pnpm-config upgrade --yes
# Updated <n> package(s); skipped <m>.
```

`--dry-run` prints the planned changes without touching the file:

```bash
npx rolldown-pnpm-config upgrade --dry-run
# example output (varies by environment)
```

`--preview` runs the full resolution and prints the colorized summary without entering interactive mode — useful for inspecting what the walk would do before committing to it:

```bash
npx rolldown-pnpm-config upgrade --preview
# example output (varies by environment)
```

## Materialized peer ranges

A catalog package is usually a bare range. It can also be the object form, which carries a separate `peer` range and an optional `strategy` the upgrade command uses to keep that peer in sync:

```ts
catalogs: {
  default: {
    packages: {
      typescript: "^5.9.0",
      effect: { range: "^3.18.0", peer: "^3.18.0", strategy: "lock" },
    },
  },
}
```

The `peer` value is materialized in source. The runtime emits it verbatim as a `<name>Peers` catalog, so consuming repos can reference a peer-compatible range distinct from the main one. `strategy` is read only by the upgrade command and tells it how to recompute that peer when the main range moves:

- `lock` pins the peer to the exact resolved version, preserving the operator (`^6.5.1`).
- `lock-minor` floors the patch to `.0`, preserving the operator (`^6.5.0`).

When you bump a package that has a `strategy`, the command recomputes its `peer` to match. If a package declares a `strategy` but has no `peer` yet, the command materializes one from the current range. Packages without a `strategy` are left exactly as written.
