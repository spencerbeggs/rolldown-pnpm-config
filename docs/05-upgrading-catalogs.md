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

Run with no flags and the command shows every discovered catalog package at once as a table, one row per package, modeled on `pnpm up -i`. Each row is a radio group over that package's candidates with `●`/`○` bubbles — keep is preselected on every row, so the table starts as a no-op. Candidates appear in order: keep, then the latest in-range version, then `minor`, then latest. `↑`/`↓` move the cursor between rows, `←`/`→` move the selection within the row under the cursor, `⏎` applies from wherever the cursor sits and `Esc` cancels without writing anything.

Every discovered row is shown, including packages already at their newest version — those appear as non-selectable context so a fully up-to-date catalog is never hidden. The cursor starts on the first actionable row, skipping past any leading up-to-date ones. In a non-interactive terminal (CI, piped output) the command automatically falls back to the same projection `--preview` prints, since there is no TTY to drive the table.

The `minor` candidate is the latest version within the package's current major line that sits beyond its caret range but below the next major — the meaningful intermediate for a `0.x` package whose caret locks the minor. It offers, say, `0.50.0` rather than forcing a jump straight from `0.49.x` to the `1.0` major. The tier is omitted when it would coincide with the in-range pick or the overall latest.

For an interop catalog the peer column shows a live group-derived floor recomputed from the current picks, so changing one member's version instantly updates every dependent's peer. A pick that no longer satisfies an in-group peer is flagged inline with `⚠`.

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
| `--full` | Applies to the non-interactive projection (`--preview` and the CI fallback): includes up-to-date entries the projection would otherwise omit. The interactive table already shows every entry, so the flag is a no-op there. |

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

The `peer` value is materialized in source. The runtime emits it verbatim as a separate peers catalog, so consuming repos can reference a peer-compatible range distinct from the main one. During the current transition it is emitted under both `<name>:peers` (the preferred colon form) and `<name>Peers` (camelCase, retained for compatibility and removed in a later release). `strategy` is read only by the upgrade command and tells it how to recompute that peer when the main range moves:

- `lock` pins the peer to the exact resolved version **as published**, operator preserved (`^6.5.1`) — including any prerelease identifier (`^3.0.0-next.8` stays `^3.0.0-next.8`, never rebuilt into an unpublished `^3.0.0`).
- `lock-minor` floors a stable version's patch to `.0`, operator preserved (`^6.5.0`). On a prerelease version, flooring would exclude the very version being catalogued, so `lock-minor` degrades to `lock` behavior and reports a warning instead.

When you bump a package that has a `strategy`, the command recomputes its `peer` to match. If a package declares a `strategy` but has no `peer` yet, the command materializes one from the current range. Packages without a `strategy` are left exactly as written, even when you keep the current range for a package that does have one.
