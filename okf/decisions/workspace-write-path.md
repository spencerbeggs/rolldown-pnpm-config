---
type: Decision
title: Export writes pnpm-workspace.yaml as edits, not a re-render
description: export applies path-targeted YamlFormat.modify edits over the existing file, in the style inferred from it, so comments, key order, quoting and unchanged lines survive; a from-scratch render is kept only for a new or empty file.
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-01T21:54:22Z
sources:
  - id: workspace-file
    resource: ../../package/src/cli/workspace-file.ts
  - id: export-ts
    resource: ../../package/src/cli/commands/export.ts
  - id: style-tests
    resource: ../../package/__test__/cli/workspace-style.test.ts
  - id: issue-280
    resource: https://github.com/spencerbeggs/rolldown-pnpm-config/issues/280
tags:
  - dx
verified:
  - by: human:spencer
    at: 2026-11-01T21:52:55Z
integrity:
  generated:
    body: 1bc1888962b7a194
  verified:
    by: human:spencer
    at: 2026-11-01T21:52:55Z
    content: 6172ef3e6602dd97
---

# Export writes pnpm-workspace.yaml as edits, not a re-render

## Context

`export` used to re-stringify the whole merged workspace with fixed options
(2-space, unindented sequences, single quotes, alpha-sorted keys), so a run
that changed a handful of catalog entries rewrote every quoted key and list
in a file written in another style, and dropped its comments.[^issue-280]

## Decision

`writeWorkspace` diffs the parsed file against the merged result, descending
through mappings present on both sides, and applies one `YamlFormat.modify`
per changed path over the existing source.[^workspace-file] Each change takes
one of two routes:

- **Scalar splice.** A primitive replacing an existing scalar is spliced into
  that scalar's own source span, unstyled, keeping its quote character and
  trailing comment. The result is accepted only when every edit stays inside
  the target scalar's span.[^workspace-file]
- **Styled edit.** Insertions, removals and replaced sequences or mappings
  go through `modify` with stringify options inferred from the file by
  `YamlLint.observe` + `resolveLenient`: indent width, `indentSequences` and
  quote style. The dominant spelling wins in a mixed file, and a dimension
  with no votes keeps the historical defaults.[^workspace-file]

New keys append to their mapping rather than sorting into place. Sequences
are compared and written in canonical order, so a reordered-but-equal list is
not touched. An empty or new file renders from scratch exactly as before, and
a source the editor refuses (multi-document, directives) is re-rendered whole
in its inferred style.[^workspace-file][^style-tests]

## Alternatives rejected

- **Re-render with inferred style only** (the issue's original scope). This
  fixes indentation and quoting but still drops comments and re-sorts the
  author's keys.[^issue-280]
- **Always pass the style options to `modify`.** Any `indent` or
  `indentSequences` option disables `modify`'s in-place scalar splice and
  sends it down the whole-document path, which re-styles the replaced scalar
  and drops its comment. Hence the unstyled splice attempt first.[^workspace-file]

## Consequences

A second export over its own output is byte-identical.[^export-ts] The
dry-run diff is unaffected: it still compares canonical forms.[^export-ts]

[^workspace-file]: ../../package/src/cli/workspace-file.ts
[^export-ts]: ../../package/src/cli/commands/export.ts
[^style-tests]: `../../package/__test__/cli/workspace-style.test.ts`
[^issue-280]: <https://github.com/spencerbeggs/rolldown-pnpm-config/issues/280>
