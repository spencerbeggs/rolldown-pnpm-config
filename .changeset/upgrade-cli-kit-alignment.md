---
"rolldown-pnpm-config": minor
---

## Breaking Changes

The `upgrade` command's `--json` flag is replaced by `--format auto|json` (default `auto`). Scripts that passed `--json` must pass `--format json` instead; `--json` is now an unknown flag and exits 64. The JSON document itself is unchanged.

## Bug Fixes

* Count messages in `upgrade` now agree with the count ("1 change", "2 changes") instead of printing "change(s)".
* The interactive `upgrade` table measures package names, ranges and annotations in terminal columns, so rows containing wide characters or emoji line up and are never split.
* Config-file selection, patch discovery and pending-changeset reads skip dotfiles, ignore a directory named like a patch, and list candidates in sorted order on every filesystem.

## Refactoring

* Error messages from config loading, registry resolution, catalog freezing and patch directives no longer start with the error's class name (`NotFound: …` rather than `PlatformError: NotFound: …`).
