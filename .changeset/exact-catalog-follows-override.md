---
"rolldown-pnpm-config": patch
---

## Bug Fixes

Fix a local override of `catalogs.<name>.<pkg>` leaving the derived `<name>:exact` catalog at its managed value, so `catalog:<name>` and `catalog:<name>:exact` resolved different lines of one package. A local range that names a single version now re-derives `<name>:exact.<pkg>`, an explicit local `<name>:exact` entry still wins, and the override warning says what happened to `<name>:exact` and `<name>:peers`. Closes #319.
