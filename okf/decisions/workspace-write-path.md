---
type: Decision
title: Export writes pnpm-workspace.yaml as edits, not a re-render
description: export applies path-targeted YamlFormat.modify edits over the existing file, in the style inferred from it, so comments, key order, quoting and unchanged lines survive; a whole render is kept for a new or empty file and as the fallback when an edit would not parse back to the intended result.
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-02T15:23:26Z
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
    body: 65feedbe74de99ea
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
one of these routes:

- **Scalar splice.** A primitive replacing an existing scalar is spliced into
  that scalar's own source span, unstyled, keeping its quote character and
  trailing comment. The result is accepted only when every edit stays inside
  the target scalar's span.[^workspace-file]
- **Per-item list edits.** A list of primitives on both sides loses the items
  the result no longer holds and gains the new ones appended, so every other
  item's line is untouched. Matching is by value, so a reorder is not a
  change.[^workspace-file]
- **Styled edit.** Insertions, removals and other replaced values go through
  `modify` with stringify options inferred from the file by
  `YamlLint.observe` + `resolveLenient`: indent width, `indentSequences` and
  quote character. The dominant spelling wins in a mixed file, and a
  dimension with no votes keeps the historical defaults.[^workspace-file]

The stringifier quotes only what it must, so a newly written key, value or
list item is then re-quoted when its siblings quote such strings by choice.
Strings that must be quoted, such as `@scope/*`, cast no vote. Siblings
decide first, so a file can quote its catalog keys yet leave top-level keys
plain; the whole document decides only when the siblings give no
vote.[^workspace-file]

New keys append to their mapping rather than sorting into place. A CRLF
source stays CRLF. An empty or new file renders from scratch exactly as
before.[^workspace-file][^style-tests]

The edited text must parse back to exactly the merged result, with no two
keys in one mapping reading as the same string; otherwise the file is
re-rendered whole in its inferred style. That one check covers every way the
edit model and the parsed value can disagree: a removed anchor leaving a
dangling alias, a splice under an anchor changing its aliases, merge keys,
and a non-string key such as `1:` gaining a `'1':` twin. A source the editor
refuses (multi-document, directives) takes the same
fallback.[^workspace-file][^style-tests]

## Alternatives rejected

- **Re-render with inferred style only** (the issue's original scope). This
  fixes indentation and quoting but still drops comments and re-sorts the
  author's keys.[^issue-280]
- **Always pass the style options to `modify`.** Any `indent` or
  `indentSequences` option disables `modify`'s in-place scalar splice and
  sends it down the whole-document path, which re-styles the replaced scalar
  and drops its comment. Hence the unstyled splice attempt first, a
  workaround for spencerbeggs/effected#1219.[^workspace-file]
- **Replace a changed list whole.** Every item is rewritten, sorted and
  re-quoted, so adding one entry to an all-quoted list rewrites every
  line.[^style-tests]

## Consequences

A second export over its own output is byte-identical.[^export-ts] The
dry-run diff is unaffected: it still compares canonical forms.[^export-ts]

[^workspace-file]: ../../package/src/cli/workspace-file.ts
[^export-ts]: ../../package/src/cli/commands/export.ts
[^style-tests]: `../../package/__test__/cli/workspace-style.test.ts`
[^issue-280]: <https://github.com/spencerbeggs/rolldown-pnpm-config/issues/280>
