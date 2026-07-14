---
"rolldown-pnpm-config": minor
---

## Bug Fixes

### Prerelease peers no longer rewrite to an unpublished version

`upgrade` no longer rewrites a `peer` range on a prerelease-pinned catalog entry to a version that was never published. A `strategy: "lock"` entry pinned to `^3.0.0-next.8` previously had its peer rewritten to `^3.0.0` on every run — even when you explicitly chose *keep* — because the derivation reconstructed the version from its parsed parts and silently dropped the prerelease tag. The derived peer now reuses the pinned version verbatim, so prerelease and build identifiers survive.

`lock-minor` on a prerelease pin (where flooring the patch would exclude the very version being catalogued) now degrades to a `lock`-style pin instead and surfaces a warning that the strategy is incompatible with the pinned line, rather than silently writing an unsatisfiable range.

### Unresolvable catalog packages are now surfaced instead of hidden

A package name the registry can't resolve — a typo, a 404, an auth failure — used to be swallowed to an empty version list, silently counted as "up to date," and hidden from the upgrade table entirely. `upgrade` now reports it explicitly (`Could not resolve N package(s) from the registry — check the name(s) for typos, or your registry auth`) so a bad name doesn't go unnoticed.

### `--dry-run` now matches what an apply would do

`--dry-run` runs the identical interactive flow — resolve, plan, validate, and the full radio-group table — and skips only the write. It previously short-circuited before the table and showed auto-picked defaults you never chose, skipping the same reconcile step a real run performs, so the "preview" didn't reflect what applying would actually do. `--dry-run` also now composes correctly with `--yes`: `--yes --dry-run` previously wrote the file anyway.

## Features

### Prerelease catalog entries can upgrade again

A catalog entry pinned to a prerelease line (for example `^3.0.0-next.8`) is no longer frozen forever. `upgrade` now offers newer prereleases on the same named track (`next.9`, `next.10`, ...) alongside the eventual stable release, so you can advance a prerelease pin without hand-editing the config. Entries on a stable range are unaffected — they never see a prerelease candidate.

### Interactive upgrade table

The interactive walk is now a single table showing every catalog package at once, grouped by catalog, modelled on `pnpm up -i`. Each row is a radio group over that package's available versions with the current value preselected: `↑↓` moves between rows, `←→` selects within a row, `⏎` applies, `Esc` cancels. Up-to-date rows are hidden by default — pass `--full` to see every package, including ones with nothing to change. Because every row defaults to "keep" and there's no select-all, running the table and doing nothing is always a no-op, and a major version bump is only applied by deliberately selecting it. The confirmation summary mirrors the same table, colored to show what changed.

### Upgrade validation against the registry

Before writing any range or peer, `upgrade` now checks that at least one published version actually satisfies it — satisfiability, not exact-version existence, so a `lock-minor` floor like `^3.4.0` still passes when only `3.4.1` shipped. Rejection is atomic per package: if either half of a package's range/peer pair fails validation, both are dropped rather than writing a bumped range next to a stale peer. In interactive mode a rejected change is dropped and reported in the summary so the rest of your upgrade still applies; `--yes` fails the run entirely (writing nothing) if any change would be unsatisfiable or if a peer strategy is incompatible with a pinned prerelease, since an unattended CI run has no chance to notice and fix a warning.
