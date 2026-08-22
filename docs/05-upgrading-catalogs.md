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
| `--check` | Pure drift gate: resolves exactly as `--yes` would, writes nothing (even combined with `--yes`), and exits `0` when every entry is in sync or `1` when anything would have been rewritten. The exit code is the contract — release validation phases call this. |
| `--json` | Machine-readable output for the non-interactive modes (`--check`, `--yes`, `--dry-run`). stdout carries exactly one single-line JSON document; all human-facing text moves to stderr or is suppressed. Exit codes are unchanged. Rejected with the interactive path and with `--preview`. |

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

### `--json` output

`--json` is for scripts and CI (a GitHub Action parsing the CLI from bash): stdout is exactly one single-line JSON document — nothing else — so a captured `$(...)` feeds straight to `jq`:

```bash
out=$(npx rolldown-pnpm-config upgrade --check --json) || echo "catalogs drifted or check failed"
echo "$out" | jq -r '.drift[] | "\(.catalog).\(.pkg): \(.from) -> \(.to // "?") (\(.source))"'
```

`upgrade --check --json` emits `{"command":"check","inSync":true|false,"drift":[...]}` where each drift row is `{"catalog":"effected","pkg":"@effected/app","from":"^0.7.0","to":"^0.8.0","source":"workspace"}` (`to` is omitted for a peer-only resync). A resolution failure keeps the non-zero exit but still emits a document — `{"command":"check","inSync":false,"error":{"kind":"resolution","message":"..."}}` — so a bash gate never sees exit `1` with an empty stdout; the human-readable failure label goes to stderr. `upgrade --yes --json` and `upgrade --dry-run --json` emit `{"command":"upgrade","applied":true|false,"updated":n,"changed":[...],"skipped":[...],"conflicts":[...]}` with `changed` rows in the same shape as `drift`; `--dry-run --json` runs the same non-interactive resolution as `--yes --dry-run` and reports `applied: false`. Without one of those modes, `--json` fails fast — JSON mode never enters the interactive table.

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

The `peer` value is materialized in source. The runtime emits it verbatim as a separate peers catalog named `<name>:peers`, so consuming repos can reference a peer-compatible range distinct from the main one. (The legacy camelCase `<name>Peers` alias from earlier releases is no longer emitted.) `strategy` is read only by the upgrade command and tells it how to recompute that peer when the main range moves:

- `lock` pins the peer to the exact resolved version **as published**, operator preserved (`^6.5.1`) — including any prerelease identifier (`^3.0.0-next.8` stays `^3.0.0-next.8`, never rebuilt into an unpublished `^3.0.0`).
- `lock-minor` floors a stable version's patch to `.0`, operator preserved (`^6.5.0`). On a prerelease version, flooring would exclude the very version being catalogued, so `lock-minor` degrades to `lock` behavior and reports a warning instead.

When you bump a package that has a `strategy`, the command recomputes its `peer` to match. If a package declares a `strategy` but has no `peer` yet, the command materializes one from the current range. Packages without a `strategy` are left exactly as written, even when you keep the current range for a package that does have one.

## Workspace-sourced entries

An object-form entry can declare `source: "workspace"` to resolve its range from the local workspace's **next release versions** instead of the npm registry — each publishable package's current manifest version overlaid with any pending changeset bump. `source` is orthogonal to `strategy`: `source` decides where the range comes from, `strategy` still decides how `peer` is derived from it.

```ts
catalogs: {
  effected: {
    packages: {
      "@effected/semver": { range: "^0.5.0", peer: "^0.5.0", strategy: "lock-minor", source: "workspace" },
    },
  },
}
```

The value is `"workspace"`, never `"workspace:^"` — the colon form reads as the pnpm workspace protocol, which cannot resolve for consumers of a published config dependency. Packages are enumerated following the `packages:` globs declared in the workspace's own `pnpm-workspace.yaml` — including nested globs and exclusion patterns, via `@effected/workspaces` (the root is found by walking up from the config file to the nearest `pnpm-workspace.yaml`) — and filtered on `publishConfig.access === "public"`, since source manifests are typically `private: true` and flipped at build time.

Two behaviors differ from registry-sourced entries:

- **The release-age gate exempts them.** An unpublished next version has no publish timestamp, so the gate would otherwise hold every workspace entry forever.
- **`--yes` and `--check` apply the workspace version even outside the caret range.** `^0.2.0` does not contain `0.3.0`, but the workspace version is this repo's own declared next release, not a surprise registry major.

Builds never write. The `PnpmConfigPlugin` build reads the config exactly as authored — the CLI owns all source rewriting: `upgrade --yes` applies workspace drift, and `upgrade --check` is the CI drift gate. A sync workflow runs the CLI, not the build.
