---
"rolldown-pnpm-config": minor
---

## Features

- `overridesFromCatalogs` takes an `include` list that selects which catalog members are pinned, so one catalog can hold a release family pinned graph-wide beside packages that must not be. `{ catalog: "effected", include: ["effect", "@effect/*"] }` pins the Effect family and leaves every other member, including ones added later, unpinned.
- `include` and `exclude` both accept glob patterns such as `@effect/*` beside exact names. A `*` stays within the scope or the bare name, so `@effect*` does not match `@effect/vitest`.
- A member matched by both lists is excluded. An entry that matches no member still fails the build, as an unknown `exclude` name already did, and an empty `include` is rejected rather than pinning nothing.
