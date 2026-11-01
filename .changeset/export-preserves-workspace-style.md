---
"rolldown-pnpm-config": minor
---

## Features

- `export` now edits an existing `pnpm-workspace.yaml` in place instead of re-rendering it. Comments, your key order, each value's quoting and every unchanged line are kept, so the diff shows only the entries that actually changed.
- Lines that `export` adds or replaces follow the file's own style: indent width, whether lists are indented under their key, and single or double quotes. In a mixed file the most common style wins.
- A new or empty `pnpm-workspace.yaml` is written exactly as before.
