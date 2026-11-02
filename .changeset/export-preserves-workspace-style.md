---
"rolldown-pnpm-config": minor
---

## Features

- `export` now edits an existing `pnpm-workspace.yaml` in place instead of re-rendering it. Comments, your key order, each value's quoting and every unchanged line are kept, so the diff shows only the entries that actually changed.
- Adding or removing an entry in a list changes only that entry's line, and Windows (CRLF) line endings are kept.
- Lines that `export` adds follow the file's own style: indent width, whether lists are indented under their key, and single or double quotes. A new key or list item is quoted when the entries beside it are. In a mixed file the most common style wins.
- A file that uses YAML anchors or aliases is still written correctly. When editing it in place could break an alias, `export` rewrites the whole file in its own style instead.
- A new or empty `pnpm-workspace.yaml` is written exactly as before.
