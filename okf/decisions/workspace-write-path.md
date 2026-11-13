---
type: Decision
title: Export writes pnpm-workspace.yaml as edits, not a re-render
description: export applies path-targeted YamlFormat.modify edits over the existing file, in the style inferred from it, so comments, key order, quoting and unchanged lines survive; a whole render is kept for a new or empty file and as the fallback when an edit would not parse back to the intended result.
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-13T04:57:23Z
sources:
  - id: workspace-file
    resource: "npm:@effected/pnpm"
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
  - by: human:spencer
    at: 2026-11-02T19:10:04Z
  - by: human:spencer
    at: 2026-11-05T22:55:27Z
integrity:
  generated:
    body: fdc000dff7aa241f
  verified:
    by: human:spencer
    at: 2026-11-05T22:55:27Z
    content: 8d1be27ce51738f7
---

# Export writes pnpm-workspace.yaml as edits, not a re-render

## Context

`export` used to re-stringify the whole merged workspace with fixed options
(2-space, unindented sequences, single quotes, alpha-sorted keys), so a run
that changed a handful of catalog entries rewrote every quoted key and list
in a file written in another style, and dropped its comments.[^issue-280]

## Decision

`PnpmWorkspaceFile.write` (`@effected/pnpm`, where this editor now lives) diffs the parsed file against the merged result, descending
through mappings present on both sides, and applies one `YamlFormat.modify`
per changed path over the existing source.[^workspace-file] Each change takes
one of these routes:

- **Scalar splice.** A primitive replacing an existing scalar is spliced into
  that scalar's own source span by `modify`, keeping its quote character and
  trailing comment. It skips the re-quoting below, so the author's spelling of
  that one value stands even when its siblings quote
  theirs.[^workspace-file][^style-tests]
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
- **An unstyled `modify` attempt before the styled one.** `@effected/yaml`
  before 0.29.0 turned off the in-place splice whenever `indent` or
  `indentSequences` was passed, which dropped the replaced scalar's comment and
  quotes, so a local `spliceScalar` tried an unstyled edit first. 0.29.0 fixed
  that (spencerbeggs/effected#1219) and the workaround was removed; every
  change now takes one styled `modify`.[^workspace-file]
- **Re-quote every written value to match its siblings.** A plain scalar among
  quoted siblings would gain quotes on a version bump, rewriting a spelling the
  author chose.[^style-tests]
- **Replace a changed list whole.** Every item is rewritten, sorted and
  re-quoted, so adding one entry to an all-quoted list rewrites every
  line.[^style-tests]

## Consequences

A second export over its own output is byte-identical.[^export-ts] The
dry-run diff is unaffected: it still compares canonical forms.[^export-ts]

[^workspace-file]: `@effected/pnpm`'s `PnpmWorkspaceFile`, the editor this repository's `writeWorkspace` became
[^export-ts]: ../../package/src/cli/commands/export.ts
[^style-tests]: `../../package/__test__/cli/workspace-style.test.ts`
[^issue-280]: <https://github.com/spencerbeggs/rolldown-pnpm-config/issues/280>
