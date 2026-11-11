---
"rolldown-pnpm-config": patch
---

## Bug Fixes

* `upgrade` resolves workspace-sourced entries against an unreadable or unparseable `pnpm-workspace.yaml` as a workspace with no packages, as before, instead of crashing under `@effected/workspaces` 0.46
