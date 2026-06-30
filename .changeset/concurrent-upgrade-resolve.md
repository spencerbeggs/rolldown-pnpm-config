---
"rolldown-pnpm-config": patch
---

## Bug Fixes

- Fixed interactive `upgrade` with `interop` catalog strategy hanging at the peer-reconcile step. `runInterop` previously eagerly prefetched `peerDependencies` for the full published-version history of every interop member (up to ~10 000 registry calls for a large `@effect` group). Peer-dependency data is now fetched lazily — only the chosen ceiling version up front, with lower versions fetched on demand during a downgrade search — making the common case approximately one registry call per member. Interop resolution results are unchanged.

## Performance

- Concurrent version resolution in `upgrade`: packages are now resolved in parallel (bounded concurrency) rather than one `pnpm view` call at a time. A ~50-package config drops from ~44 s to ~7 s.
- Live progress (`Resolved X/N`) is printed to stderr in interactive terminals so the command no longer appears to hang during resolution.
