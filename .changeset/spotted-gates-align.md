---
"rolldown-pnpm-config": patch
---

## Refactoring

* The upgrade CLI's release-age gate now comes from `@effected/npm`'s `ReleaseAgeGate` instead of an internal copy, so one implementation serves every consumer. Behavior is unchanged: strictest age wins, exclude patterns keep pnpm's `@pnpm/matcher` (`*` crosses `/`) semantics, and too-young or timestamp-less versions are dropped. The two config readers (`readConfigReleaseAge`, `parsePnpmGate`) stay local and feed their partial gates into `ReleaseAgeGate.combine`.

## Dependencies

| Dependency    | Type       | Action | From | To     |
| :------------ | :--------- | :----- | :--- | :----- |
| @effected/npm | dependency | added  | —    | ^0.3.0 |
