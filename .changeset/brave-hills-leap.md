---
"rolldown-pnpm-config": patch
---

## Bug Fixes

* Declared the full `effect` v3 peer closure of `@effect/platform-node` and `@effect/cli` as regular dependencies (`@effect/cluster`, `@effect/experimental`, `@effect/printer`, `@effect/printer-ansi`, `@effect/rpc`, `@effect/sql`, `@effect/typeclass`, `@effect/workflow`) instead of relying on pnpm's `autoInstallPeers` to resolve them from the consumer's workspace. Previously, a consumer with `effect` v4 installed anywhere else in their workspace could poison this package's `effect` v3 peer resolution and crash it at load. No API changes — the dependency tree is now self-contained.

## Dependencies

| Dependency           | Type       | Action  | From     | To       |
| -------------------- | ---------- | ------- | -------- | -------- |
| oxc-parser           | dependency | updated | ^0.137.0 | ^0.138.0 |
| semver-effect        | dependency | updated | ^0.2.1   | ^0.3.1   |
| std-osc8             | dependency | updated | ^0.1.0   | ^0.2.0   |
| @effect/cluster      | dependency | added   | —        | ^0.59.0  |
| @effect/experimental | dependency | added   | —        | ^0.60.0  |
| @effect/printer      | dependency | added   | —        | ^0.49.0  |
| @effect/printer-ansi | dependency | added   | —        | ^0.49.0  |
| @effect/rpc          | dependency | added   | —        | ^0.75.1  |
| @effect/sql          | dependency | added   | —        | ^0.51.1  |
| @effect/typeclass    | dependency | added   | —        | ^0.40.0  |
| @effect/workflow     | dependency | added   | —        | ^0.18.2  |
