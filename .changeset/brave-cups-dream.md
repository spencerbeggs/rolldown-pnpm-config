---
"@spencerbeggs/pnpm-config-builder": patch
---

## Documentation

Added `docs/04-pnpm-settings-coverage.md` — a reference page listing all 121 managed pnpm-workspace.yaml settings with their merge strategy, default enforcement level, and a link to the upstream pnpm docs for each field. A separate table lists settings that are intentionally outside the managed surface.

## Dependencies

| Dependency           | Type          | Action  | From   | To     |
| -------------------- | ------------- | ------- | ------ | ------ |
| @savvy-web/vitest    | devDependency | removed | ^1.5.1 | —      |
| @vitest-agent/plugin | devDependency | added   | —      | ^1.0.0 |
