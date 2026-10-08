---
"rolldown-pnpm-config": patch
---

## Bug Fixes

* `upgrade`: pressing Esc on the interactive table now closes it with "cancelled; nothing written" and exits 0 instead of 130, so `pnpm run` wrappers no longer report backing out as a failure. Ctrl-C still exits 130.
* Line-oriented CLI output (diff rows, upgrade summary table rows and `upgrade --check` drift rows) no longer wraps at any terminal width. Piped, agent and CI output is unchanged.
* `preview`: over-wide explorer rows are truncated to the terminal width instead of wrapping, so a row's name is no longer hidden and the screen no longer overflows its height. The legend no longer wraps.
* `preview` no longer prints Node's `MaxListenersExceededWarning` into the terminal while the explorer is drawn.
