---
"rolldown-pnpm-config": patch
---

## Refactoring

- Port the `upgrade`, `export`, and `preview` CLI commands to the PascalCase `Argument`/`Flag` constructors introduced in Effect 4.0.0-rc.113 (`Argument.File`, `Flag.Boolean`, `Flag.String`). Flag and argument parsing is unchanged.
