---
"rolldown-pnpm-config": major
---

## Breaking Changes

The `rolldown-pnpm-config` CLI now runs on the `@effected/cli` kit. Output and exit codes follow a new, documented contract, and a few things scripts could notice have changed.

* Usage errors (an unknown flag, `--json` without `--check`, `--yes` or `--dry-run`, or two audience flags) now exit `64` instead of `1`.
* Quitting the interactive upgrade table with Esc or Ctrl-C now exits `130` instead of `0`. Nothing is written, as before.
* Failure reports are drawn as `✗ <message>`, without the error class name.
* The `Exported to …` and `Applied N change(s).` success lines now carry a status glyph.
* The `(unmanaged)` diff tag now always shows.
* Warnings moved from stdout to stderr: the unresolvable-package warning (under `--preview`, the non-interactive fallback and after the interactive table) and the `--yes` interop-conflict list. Capturing stdout alone, as in `upgrade --preview > out.txt`, no longer includes them.

### Migration

* Scripts that treated any non-zero exit from a bad invocation as `1` should treat `64` as a usage error.
* Scripts that treated a quit of the interactive table as success should treat `130` as a user quit.
* `upgrade --check` drift still exits `1`, and the `--json` document contract is unchanged.
* Anything that matched on error class names or the exact text of success lines should be updated.
* Scripts that read the unresolvable-package or interop-conflict warnings from stdout should read stderr instead.

## Features

### Audience-aware output

* Every command accepts `--audience human|agent|ci`, with the shorthands `--human`, `--agent` and `--ci`.
* The `ROLLDOWN_PNPM_CONFIG_AUDIENCE` and `ROLLDOWN_PNPM_CONFIG_LOG_LEVEL` environment variables set the audience and log level.
* Agent and CI output is plain and escape-free. Under GitHub Actions the output is formatted for the Actions log.

### Interactive improvements

* The upgrade table scrolls to fit the terminal and supports vim keys (`h`, `j`, `k`, `l`).
* A live progress line shows while versions resolve.
* The preview explorer scrolls long views.

### Help

* Flag and argument descriptions now appear in `--help`.
* Help shown after a usage error goes to stderr.

## Bug Fixes

* `upgrade --check --json` and `upgrade --yes --json` now emit the JSON document even when no config file is found. Previously stdout was empty.
