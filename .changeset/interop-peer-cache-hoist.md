---
"rolldown-pnpm-config": patch
---

## Performance

- Shared peerDeps cache across interactive `upgrade` re-entry rounds; later rounds reuse immutable `(package, version)` lookups fetched by earlier rounds instead of re-issuing `pnpm view` calls.
- Cuts re-entry latency for large interop groups — the `@effect` ecosystem in particular, where a single member can publish dozens of versions.
