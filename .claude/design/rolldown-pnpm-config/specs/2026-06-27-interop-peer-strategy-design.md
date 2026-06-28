# Interop Peer Strategy — Design

Date: 2026-06-27
Status: Approved (brainstorm); pending implementation plan
Branch: `feat/peer-interop`

## Goal

Add a third catalog peer strategy, `interop`, to the `upgrade` CLI. Where `lock`
and `lock-minor` derive a single package's peer literal from its own chosen
range (purely, offline), `interop` handles a **set of interrelated packages that
declare each other as peers** — the situation the `@effect` ecosystem creates,
where `effect`, `@effect/cli`, `@effect/platform`, etc. each constrain the
others through `peerDependencies`.

The author wants to bump the set, let the resolver reconcile the chosen versions
against the cross-package peer constraints, and then materialize each member's
`peer` range as the lowest version compatible across the whole group — so a
downstream consumer of the author's library gets one coherent, internally
consistent peer surface.

This universalizes the existing `pnpm-plugin-silk` helper
`resolve-effect-versions.ts` (which hardcodes the `effect`/`@effect/*` filter)
into a general, catalog-driven strategy. The script's two algorithms —
`resolveVersions` (reconcile the set) and `deriveSilkPeers` (derive the floors)
— are the basis; group membership replaces the hardcoded ecosystem filter.

## Decisions (from brainstorm)

1. **Group identity — per catalog.** Every package in a single catalog marked
   `strategy: "interop"` forms one group. Different catalogs are different
   groups. Narrow catalogs (e.g. `react18` vs `react19`) are the intended way to
   separate sets. `strategy` stays a bare string — no `group` key.

2. **Scope — full resolve, not floor-only.** After the user selects ranges, the
   interop pass may **adjust** those selections to satisfy cross-peer
   constraints, then derives the floors. It does *not* discover new ecosystem
   packages; it operates only on packages already declared in the catalog.

3. **Adjustment direction — downgrade dependents only.** Selections are
   ceilings. For member `P` that peer-depends on member `Q`, if `Q`'s chosen
   version violates `P`'s peer range, pick `P`'s highest published version ≤ the
   user's pick whose peer on `Q` is satisfied. The peer target is never
   downgraded and no selection is ever raised. The dependency-only member (e.g.
   `effect` core, which has no in-group peerDeps) is the de-facto anchor without
   being named. Members unsatisfiable at/below their pick become **conflicts**.

4. **Surfacing — re-enter the walk.** When the resolve pass pulls a member below
   the user's interactive pick (or hits a conflict), the affected members
   re-enter the interactive walk with the constraint shown, so the user can
   accept the downgrade *or* re-pick. The affected set includes the peer
   **target**, so the user may choose to raise the anchor instead of accepting a
   dependent downgrade. The loop re-runs the resolve pass until the set is
   internally compatible or remaining conflicts are accepted. In `--yes` mode
   there is no prompt: downgrades auto-apply and conflicts are reported.

5. **Peer output shape — caret `^<floor>`.** The derived peer is the lowest
   floor any group member declares for that package, emitted with a caret. This
   caps at the major boundary so a surprise `effect@4` cannot satisfy a peer
   meant for the 3.x line. Standard semver caret semantics apply, so a `0.x`
   floor caps at the next *minor* (`^0.90.0` → `>=0.90.0 <0.91.0`). This is
   accepted: the derived peer is a starting point the author validates by
   running a real install in a monorepo; the tool cannot catch every case.

6. **Respect `minimumReleaseAge` — strictest of both sources.** No resolution
   path (existing `lock`/`lock-minor` plan *or* interop `resolveGroup`) may
   propose a version younger than the user's effective release-age gate, since
   pnpm would refuse to install it. The effective age is
   `max(config-declared, pnpm-resolved)` and the exempt set is
   `union(config-declared, pnpm-resolved)` — a package the author marked exempt
   in *either* source stays exempt. See [Respecting
   minimumReleaseAge](#respecting-minimumreleaseage).

## Type changes

- `PeerStrategy` in `package/src/catalogs.ts`:
  `"lock" | "lock-minor"` → `"lock" | "lock-minor" | "interop"`.
- `CatalogPackageSpec` is unchanged.
- `normalizeCatalogs` already ignores `strategy`, so the build/runtime side
  needs **zero** changes — `interop` is a CLI-only concern, like the other
  strategies.
- The compile-time drift guard and field schemas are unaffected: `peer` remains
  a range-string field; `interop` simply produces a `^…` value.

## Algorithms

Both are pure functions, ported and generalized from the script, unit-tested
against fixture packuments.

### `resolveGroup` (generalizes `resolveVersions`)

Inputs: the group members with the user's chosen version per member (the
ceiling), and a way to read any candidate version's `peerDependencies`
restricted to in-group packages.

Behavior: pin each member at its ceiling; iterate. For each member `P` with an
in-group peer on `Q`, if the resolved `Q` violates `P`'s declared range, replace
`P` with its highest published version ≤ `P`'s ceiling whose in-group peers are
all satisfied. Never raise a ceiling; never downgrade a peer target. Iterate to a
fixed point (bounded iteration count, as the script does). Members with no
satisfiable version ≤ their ceiling are emitted as conflicts (with the blocking
constraints), left at the user's pick.

The script's robustness guards carry over: cap candidate versions at the
registry's `dist-tags.latest` so an early mis-published high version (effect's
`1.0.0`-then-reset-to-`0.x` history) is never selected; only stable
(non-prerelease) versions are candidates; and versions younger than the
effective release-age gate are excluded (see [Respecting
minimumReleaseAge](#respecting-minimumreleaseage)) so the downgrade search never
lands on an un-installable version.

### `deriveFloors` (generalizes `deriveSilkPeers`)

For each resolved member, scan its `peerDependencies`; for every peer that is
**also a group member**, record the floor (the version digits) of the declared
range. Each member's derived peer = `^<lowest floor any member declares for it>`.
A member that no other member peer-depends on falls back to
`^<its resolved version>`. Group membership — the set of `interop` packages in
the catalog — is the filter that replaces the script's hardcoded
`effect`/`@effect/*` check.

## Registry extension

`RegistryResolver` (`package/src/cli/resolve.ts`) currently shells
`pnpm view <pkg> versions --json`. It gains the ability to read a specific
version's `peerDependencies`, since the downgrade search needs peerDeps for
versions other than latest.

Proposed: `pnpm view <pkg>@<version> peerDependencies --json`, fetched lazily
and memoized during the resolve loop — consistent with the existing principle of
reusing the user's `.npmrc`, scoped registries and auth tokens through `pnpm`
rather than fetching `registry.npmjs.org` directly. Per-package failures degrade
to a skip/conflict and never abort the run, matching the existing resolver.

It also gains a way to read each package's publish timestamps
(`pnpm view <pkg> time --json` → version → ISO date map), memoized alongside
versions, to feed the release-age gate below.

**Open implementation choice (defer to the plan):** lazy per-version fetch
(bounded, but several round-trips per package during the downgrade search) vs. a
single packument read per package (one round-trip, all peerDeps *and* times at
once, but re-introduces direct-registry access the CLI otherwise avoids). The
single-packument option also collapses the separate `peerDependencies` and
`time` reads into one call.

## Respecting minimumReleaseAge

pnpm's `minimumReleaseAge` blocks installing versions younger than a threshold
(in minutes), with `minimumReleaseAgeExclude` exempting matching packages. The
CLI must honor this in **every** resolution path — the existing plan candidates
and interop's `resolveGroup` — so it never proposes a version the user's own
install would reject. (`pnpm view … versions` returns all versions regardless of
age, so without this the CLI silently regresses against the script, which gated
by a publish-time cutoff.)

**Effective settings.** Read both sources and combine per the brainstorm
decision:

- Age = `max(configValue, pnpmResolvedValue)` (strictest wins). `configValue`
  comes from the `minimumReleaseAge` field in the `PnpmConfigPlugin(...)` call
  the CLI already statically parses (`discover.ts` extended to read it); it is
  the plugin-managed source of truth and reflects the author's intent even
  mid-edit. `pnpmResolvedValue` comes from `pnpm config get minimumReleaseAge`
  (picks up `pnpm-workspace.yaml` / `.npmrc` / the active built pnpmfile). A
  missing source contributes nothing; both missing → 0 (no gate).
- Exempt set = `union(configExclude, pnpmResolvedExclude)` — a package the author
  marked exempt in *either* source stays exempt (intentionally the more
  permissive combine, per the decision).

**Gate.** For each candidate package, drop any version whose publish time is
newer than `now − age_minutes·60·1000`, unless the package name matches the
exempt set. A version with no publish timestamp is treated as un-verifiable and
excluded (matches the script). When the age is 0 the gate is a no-op and no
`time` fetch is needed.

The gate filters the candidate list **before** both `planEntry` and
`resolveGroup` see it, so latest-in-range, latest-overall and the interop
downgrade search all operate only on installable versions.

## Pipeline wiring

`plan.ts` change: for interop members, **defer** the per-candidate peer — do not
call `derivePeerRange`, since the peer is group-derived after selection.
`lock`/`lock-minor` paths are untouched.

New unit `package/src/cli/interop.ts`, invoked from
`commands/upgrade.ts` between the walk and `summary`/`edits`:

```text
Walk picks ranges
  ↓ for each catalog with ≥1 interop member: resolveGroup
  ↓ adjustments or conflicts?
      ├─ interactive: re-enter the walk for affected members (incl. peer
      │   targets), constraint shown; user re-picks → re-run resolveGroup →
      │   repeat until internally compatible or conflicts accepted
      └─ --yes: auto-apply downgrades, print conflicts, no prompt
  ↓ deriveFloors → peer edits
  ↓ existing confirmation diff (final ranges + derived peers + conflicts)
  ↓ write
```

This expands `walk-reducer.ts` with a re-entry state. The loop terminates on a
stable, internally compatible set or when the user accepts remaining conflicts.

### Drift / materialize / recompute, group-flavored

- **Recompute** moves from per-candidate (`plan.ts`) to the group pass.
- **Materialize**: an interop member with no `peer` yet gets `^<floor>` inserted
  at the end of the range span (reuses `applyEdits` zero-width insert).
- **Drift**: because the floor is group-derived, detecting whether a
  materialized `peer` still matches requires the network recompute. Interop
  therefore always does registry work on a run, even when no range changed —
  worth calling out as a cost relative to `lock`/`lock-minor` (which detect
  drift offline).

## Error handling & edges

- Registry failure for a member → that member is skipped/conflicted, run
  continues.
- A catalog with a single interop member (no in-group edges) → its peer falls
  back to `^<resolved version>`.
- Non-literal or complex (multi-comparator) ranges remain skips, as today.

## Testing

- `resolveGroup` and `deriveFloors` — pure, unit-tested against fixture
  packuments, including the real effect-ecosystem conflict shapes the script
  handles and the early-Effect `1.0.0`-then-`0.x` mis-publish guard.
- `walk-reducer` re-entry — reducer unit tests.
- End-to-end with a stubbed `RegistryResolver` under `package/__test__/cli/`:
  clean group, dependent-downgrade, unresolvable conflict, `--yes` auto-apply,
  materialize, drift-only resync, single-member fallback.
- Release-age gate — pure unit tests on the candidate filter with injected
  publish times and a fixed `now`: a too-young version is dropped from both
  `planEntry` and `resolveGroup` candidates; an exempt-matched package is kept;
  a version with no timestamp is dropped; `age = max(config, pnpm)` and
  `exclude = union(config, pnpm)` combine correctly; `age = 0` is a no-op.

## Out of scope

- Discovering ecosystem packages not already declared in the catalog.
- Raising a selection or downgrading a peer target to reconcile.
- Any change to the build/runtime engine — `interop` is CLI-only.
