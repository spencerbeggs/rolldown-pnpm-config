---
type: Convention
title: Commit message format
description: Every commit needs a conventional-commit type and a DCO Signed-off-by trailer, enforced by the commit-msg hook via @savvy-web/commitlint.
stale_after: 2026-12-08T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: root-claude-md
    resource: CLAUDE.md
---

# Commit message format

Write every commit message in conventional-commit format (`feat`, `fix`,
`chore`, and the rest of the type enum) and include a DCO signoff trailer —
`Signed-off-by: Name <email>`.[^root-claude-md]

The `commit-msg` Husky hook enforces this via `@savvy-web/commitlint`
(`lib/configs/commitlint.config.ts`, `CommitlintConfig.silk()`); a commit
missing either the conventional type or the DCO trailer fails the
hook.[^root-claude-md]

See [test-layout](test-layout.md) and
[import-and-module-style](import-and-module-style.md) for the other
pre-commit-enforced conventions in this repository.
