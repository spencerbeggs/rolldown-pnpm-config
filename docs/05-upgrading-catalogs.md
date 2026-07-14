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

## Interactive table (default)

Run with no flags and the command shows every catalog package at once as a table, one row per package, modeled on `pnpm up -i`. Each row is a radio group over that package's candidates (keep, then in-range, then latest) with `●`/`○` bubbles — keep is preselected on every row, so the table starts as a no-op. `↑`/`↓` move the cursor between rows, `←`/`→` move the selection within the row under the cursor, `⏎` applies from wherever the cursor sits and `Esc` cancels without writing anything. A package already at the newest available version is hidden by default; pass `--full` to show it anyway. In a non-interactive terminal (CI, piped output) the command automatically falls back to the same projection `--preview` prints, since there is no TTY to drive the table.

```bash
npx rolldown-pnpm-config upgrade
# opens the radio-group table, then on <Enter>:
# Applied <n> change(s).
```

## Flags

| Flag | Effect |
| ---- | ------ |
| `--yes` | Non-interactive. Takes the latest in-range version for every package without prompting. Never crosses a major bump, and fails hard — nothing written — on any warning, unsatisfiable range or package name the registry could not resolve at all. |
| `--dry-run` | Runs the identical table, picks, and interop reconciliation as an unflagged run, and skips only the final write. Composes with `--yes` for a non-interactive dry run. |
| `--catalog <name>` | Restricts the table to a single named catalog. |
| `--preview` | Non-interactive projection: resolves every package, takes the default picks and prints the colorized summary — no table, no write. |
| `--full` | Used with `--preview`, `--dry-run`, or the interactive table: disables the up-to-date filter and shows every catalog entry. |

`--yes` is the unattended path — useful in scripts or a scheduled job:

```bash
npx rolldown-pnpm-config upgrade --yes
# Updated <n> package(s); skipped <m>.
```

`--dry-run` runs the real table interactively and prints what would have been written, without touching the file. Its header carries a `DRY RUN` banner and the closing line reads `Dry run — no changes written.` instead of `Applied <n> change(s).`:

```bash
npx rolldown-pnpm-config upgrade --dry-run
# example output (varies by environment)
```

`--preview` runs the full resolution and prints the colorized summary without entering the table — useful for inspecting what an upgrade would do before committing to it:

```bash
npx rolldown-pnpm-config upgrade --preview
# example output (varies by environment)
```

A prerelease-pinned package (for example `^3.0.0-next.8`) is offered same-track prerelease candidates (`next.9` and beyond) alongside the usual stable ones, instead of being frozen until a stable release ships. A package name the registry cannot resolve at all — a typo, a removed package, an auth failure — is surfaced as its own warning rather than silently treated as up to date: the table banners it, `--preview` appends it to the projection and `--yes` fails the run outright.

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

- `lock` pins the peer to the exact resolved version **as published**, operator preserved (`^6.5.1`) — including any prerelease identifier (`^3.0.0-next.8` stays `^3.0.0-next.8`, never rebuilt into an unpublished `^3.0.0`).
- `lock-minor` floors a stable version's patch to `.0`, operator preserved (`^6.5.0`). On a prerelease version, flooring would exclude the very version being catalogued, so `lock-minor` degrades to `lock` behavior and reports a warning instead.

When you bump a package that has a `strategy`, the command recomputes its `peer` to match. If a package declares a `strategy` but has no `peer` yet, the command materializes one from the current range. Packages without a `strategy` are left exactly as written, even when you keep the current range for a package that does have one.
