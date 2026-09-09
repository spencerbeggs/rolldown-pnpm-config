---
type: Decision
title: Surgical span rewrite, operator preserved
description: The upgrade CLI rewrites only the version digits inside a range literal, reuses the existing operator, and applies edits right-to-left so byte spans stay valid.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: discover
    resource: package/src/cli/discover.ts
  - id: rewrite
    resource: package/src/cli/rewrite.ts
  - id: edits
    resource: package/src/cli/edits.ts
  - id: types
    resource: package/src/cli/types.ts
tags:
  - architecture
---

# Surgical span rewrite, operator preserved

## Context

Because `upgrade` never executes the config (see the sibling decision on
static discovery), every rewrite it performs has to happen by editing the
source text directly, at the byte spans discovery recorded. A rewrite
strategy that reformats the file, drops the author's chosen operator
(`^`/`~`/exact), or corrupts later spans when an earlier edit shifts the
text would undermine the "versions stay visible in code, formatting
preserved" goal the whole CLI exists to serve.

## Decision

Only the version digits inside a `range` literal change; the leading
`^`/`~`/exact operator is reused from the original range
(`CatalogEntry.operator`, `package/src/cli/types.ts:8`), so an upgrade
never reformats the file or mangles the operator.[^types] Complex ranges
(`>=5 <6`) and non-literal values are surfaced as skips rather than
rewritten (`package/src/cli/discover.ts:136-139`).[^discover] `buildEdits`
(`package/src/cli/edits.ts:16-62`) turns a chosen decision into
`PlannedEdit`s — span replacements tagged with the originating package,
whether the edit rewrites a `range` or a `peer` literal, and the unquoted
value.[^edits] `applyEdits` (`package/src/cli/rewrite.ts:10-26`) sorts the
edits descending by start offset before applying them, so each edit's
offsets stay valid as later text shifts, and throws a `RangeError` on any
overlap.[^rewrite] The write is atomic and single-file: `applyEdits`
returns a whole new string built entirely from the original source plus
the edit text, formatting elsewhere in the file untouched.[^rewrite]

## Alternatives rejected

- **Reformat the whole file after rewriting.** Rejected: the whole point
  of an in-place, span-based rewrite is that the author's formatting,
  comments, and structure survive untouched; a reformat pass would erase
  that guarantee for no benefit.
- **Apply edits left-to-right in source order.** Rejected: an earlier
  edit's replacement text can be a different length than the literal it
  replaces, which shifts every subsequent byte offset computed against the
  original source. Applying right-to-left (highest offset first, as
  `applyEdits` does) means every not-yet-applied span is still valid
  because nothing before it in the file has moved
  yet.[^rewrite]
- **Attempt to rewrite a complex multi-comparator range by editing around
  its structure.** Rejected: doing so correctly would require actually
  understanding semver range algebra well enough to preserve the author's
  intent, which is exactly the ambiguity static discovery is built to
  avoid; such ranges are surfaced as skips instead.[^discover]

## Consequences

- A `PlannedEdit`'s span is only valid against the original source text;
  any code that reorders or re-derives edits must preserve the
  right-to-left application order in `applyEdits` or spans will corrupt.
- Two edits with overlapping spans (for example a malformed pair of range
  and peer edits) fail the write outright with a thrown `RangeError`
  rather than silently applying one and dropping the
  other.[^rewrite]
- Adding a new managed literal (beyond `range` and `peer`) means threading
  its span through discovery and `buildEdits` the same way, not inventing
  a separate rewrite path.

[^discover]: discover
[^rewrite]: rewrite
[^edits]: edits
[^types]: types
