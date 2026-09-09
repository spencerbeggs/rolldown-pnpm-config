---
type: Convention
title: Test file layout
description: Tests live in package/__test__/, never co-located in src/; classification is by filename suffix, and utils/fixtures are per-category and excluded from discovery.
stale_after: 2026-12-08T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: test-claude-md
    resource: package/__test__/CLAUDE.md
---

# Test file layout

Put every test in `package/__test__/`. Never put a test file in `src/`.[^test-claude-md]

## Classify by filename, not by directory

Classification is by filename suffix, not by which directory a file sits
in:[^test-claude-md]

- `*.test.ts` — a unit test. May be grouped into topic subdirectories such
  as `descriptors/`, `plugin/`, or `runtime/`.[^test-claude-md]
- `*.e2e.test.ts` — always an end-to-end test, regardless of which
  directory it sits in.[^test-claude-md]
- `*.int.test.ts` — always an integration test, regardless of which
  directory it sits in.[^test-claude-md]
- `*.test-d.ts` — a compile-time type test, asserted under the typecheck
  pass, not the runtime test pass (e.g. the `PluginConfig`-to-descriptor-table
  drift guard).[^test-claude-md]

## `utils/` and `fixtures/` are per-category and excluded from discovery

Each test category owns its own `utils/` and `fixtures/` —
`__test__/utils/` and `__test__/fixtures/` for unit tests,
`__test__/e2e/utils/` and `__test__/e2e/fixtures/` for e2e,
`__test__/integration/utils/` and `__test__/integration/fixtures/` for
integration. Do not share helpers across categories; their setup needs
differ.[^test-claude-md] Both directories are excluded from test
discovery.[^test-claude-md]

- Put shared mocks, test helpers, builder functions, and type utilities in
  the category's `utils/`. Never define a shared mock or helper function
  inline in a test file — extract it.[^test-claude-md]
- Put static data (JSON, fixtures, sample files) in the category's
  `fixtures/`. Never inline large test data in a test file — extract it to
  `fixtures/`.[^test-claude-md]

`package/__test__/CLAUDE.md` is the authoritative source for these rules;
follow it over any other summary, including this one, where they
differ.[^test-claude-md]
