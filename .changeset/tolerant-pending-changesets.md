---
"rolldown-pnpm-config": patch
---

## Bug Fixes

A malformed changeset no longer hides every other pending bump from the `upgrade` command's workspace resolver. It now drops only that file's bumps, and the valid changesets still set each workspace package's next version.

When a workspace-sourced catalog entry resolves past a malformed changeset, `upgrade --check` and `upgrade --yes` now fail (exit 1, JSON `error.kind` `"changeset"`) and write nothing, because the workspace versions they read may be stale. The interactive table, the non-interactive summary and `--preview` report the file as a warning on stderr instead, naming it and why it would not parse.
