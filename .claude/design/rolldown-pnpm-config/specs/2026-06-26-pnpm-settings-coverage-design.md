# Design: Full pnpm-workspace.yaml Settings Coverage

- **Date:** 2026-06-26
- **Status:** Implemented (branch `feat/complete-schema`) — see [`../settings-coverage.md`](../settings-coverage.md) for the live matrix and [`../architecture.md`](../architecture.md) for the current-state architecture.
- **Branch:** `feat/complete-schema`
- **Supersedes:** none (extends the Phase 1 engine documented in
  `.claude/design/rolldown-pnpm-config/architecture.md`)

## Goal

The engine has reached parity with `pnpm-plugin-silk` (14 managed fields). This
work grows the managed field surface to cover **every workspace-appropriate
setting** configurable in `pnpm-workspace.yaml`, using a single declarative
source of truth, while leaving the runtime merge engine, serialization, and
warning formatting untouched.

## Scope

**In scope:** every setting that shapes dependency-graph / install / build /
workspace / publish behavior and is meaningful to commit to a shared
`pnpm-workspace.yaml`.

**Out of scope (by classification rule):** machine/user/CI-specific keys —
paths & dirs, proxy/TLS/registry-auth, CLI/reporter/user-env, pnpmfile meta,
and experimental flags. Also out of scope: Phase 2 CLI resolver; any change to
the runtime engine (`createHooks`), the strategy table internals,
serialization, or warning-box formatting.

The full per-key classification is the **Coverage Matrix** below.

## Sources

- pnpm settings docs: <https://pnpm.io/settings> (authoritative for prose,
  defaults, and anchors)
- schemastore JSON Schema: <https://www.schemastore.org/pnpm-workspace.json>
  (cross-check for key names/types/enums; **may be stale** — pnpm.io wins on
  conflict)
- `confirmModulesPurge` is a real boolean setting but is **undocumented
  upstream** (absent from both pnpm.io and schemastore); it is carried over
  from the Silk parity set and has no anchor link.

---

## Architecture

### The descriptor table (single source of truth)

Replace the three parallel maps — the hand-written `PluginConfig` interface
(`define-plugin.ts`), `FIELD_SCHEMAS` (`freeze.ts`), and `FIELD_REGISTRY`
(`registry.ts`) — with **one descriptor table**. Each field is one entry:

```ts
// package/src/descriptors/types.ts
interface FieldDescriptor<A = unknown> {
  readonly schema: Schema.Schema<A, unknown>; // Effect Schema validation
  readonly strategy: StrategyName;            // merge behavior (existing table)
  readonly enforcement: Enforcement;          // "warn" | "absent" | "error"
  readonly doc: string;                       // one-line summary for authors
  readonly anchor?: string;                   // pnpm.io/settings#<anchor>
  readonly options?: FieldOptions;            // e.g. { excludeByRepo: true }
  readonly samples: { valid: unknown[]; invalid: unknown[] }; // for tests
}
```

From the table we **derive** what code already consumes:

- `FIELD_SCHEMAS` ← `mapValues(DESCRIPTORS, d => d.schema)` (used by `freeze.ts`)
- `FIELD_REGISTRY` ← `mapValues(DESCRIPTORS, d => ({ strategy, enforcement }))`
- the descriptor-derived authoring type (see *Authoring types*)

`freeze.ts` and `registry.ts` stop hand-listing fields and read the derived
maps. The `{ base, manifest }` contract, the runtime engine, the strategy
table, enforcement, and serialization are **unchanged** — this is purely a
front-of-pipeline change.

### Organization

The descriptor table is split across **category modules** merged into one
table, to keep ~120 entries navigable:

```text
package/src/descriptors/
├── types.ts          # FieldDescriptor, FieldOptions, StrategyName
├── index.ts          # DESCRIPTORS = { ...resolution, ...hoisting, ... }; derivations
├── resolution.ts     # overrides, packageExtensions, catalog(s), patches, ...
├── hoisting.ts
├── node-modules.ts
├── store.ts
├── lockfile.ts
├── peers.ts
├── build.ts
├── scripts.ts
├── workspace.ts
├── network.ts
├── publish.ts
└── misc.ts
```

### Migration of the existing 14

The 14 already-managed fields migrate into the descriptor table with their
**exact current strategy + enforcement preserved verbatim** (parity-locked):

| field | strategy | enforcement |
| --- | --- | --- |
| `catalogs` | `catalogs` | `warn` |
| `confirmModulesPurge` | `scalar` | `absent` |
| `packageExtensions` | `mapChildWins` | `absent` |
| `allowedDeprecatedVersions` | `mapChildWins` | `absent` |
| `publicHoistPattern` | `arrayUnion` | `absent` (+`excludeByRepo`) |
| `minimumReleaseAgeExclude` | `arrayUnion` | `absent` |
| `supportedArchitectures` | `arrayRecordUnion` | `absent` |
| `auditConfig` | `arrayRecordUnion` | `absent` |
| `overrides` | `overrides` | `warn` |
| `peerDependencyRules` | `peerDependencyRules` | `warn` |
| `strictDepBuilds` | `securityFlag` | `warn` |
| `blockExoticSubdeps` | `securityFlag` | `warn` |
| `minimumReleaseAge` | `securityMin` | `warn` |
| `allowBuilds` | `allowBuilds` | `warn` |

The **parity suite is the safety net**: if these 14 entries reproduce
byte-identical `{ base, manifest }` and merged output vs. Silk's oracle, the
migration is proven behavior-preserving.

### Strategies and schemas — reuse, not new machinery

The existing 10 strategies cover essentially all new fields. The new fields are
overwhelmingly:

- scalars (bool / number / string / **enum**) → `scalar` (local wins)
- arrays → `arrayUnion` (union + sort)
- records → `mapChildWins` / `arrayRecordUnion`

Enums need no new strategy: they validate via `Schema.Literal(...)` in the
descriptor and merge with plain `scalar`. **No new merge engines are
anticipated.** Two fields to confirm during implementation:

- `catalog` (singular default catalog) — assigned `mapChildWins` / `warn`; a
  dedicated catalog-style override-detection strategy may be warranted (flag at
  implementation).
- `updateConfig` / `executionEnv` / `configDependencies` — nested objects;
  `mapChildWins` (child-wins shallow merge) is the default. Confirm shallow
  merge is acceptable per field.

### Enforcement default policy (new fields)

- **security / supply-chain fields → `warn`**
- **all other fields → `absent`** (local config wins silently)

Authors override per field via the `FieldInput` wrapper
(`{ value, enforcement }`). The 14 migrated fields keep their locked values
above regardless of this policy.

---

## Authoring types (hybrid)

The descriptor table yields a derived type:

```ts
type DerivedPluginConfig = {
  [K in keyof typeof DESCRIPTORS]?: FieldInput<
    Schema.Schema.Type<(typeof DESCRIPTORS)[K]["schema"]>
  >;
};
```

We keep a **hand-authored `PluginConfig` interface** for DX — explicit field
types, rich per-field JSDoc, and the special `publicHoistPattern` shape with
`excludeByRepo` — and add a **compile-time assertion** (no runtime cost) that
the hand-authored interface is structurally equivalent to the derived type:

```ts
// package/__test__/types/plugin-config.test-d.ts
type _AssertExact = Expect<Equal<Required<PluginConfig>, Required<DerivedPluginConfig>>>;
```

Drift between the descriptor table and the authoring interface now **breaks
`pnpm typecheck`** rather than surfacing silently at runtime. The
`FieldInput<T>` wrapper and `excludeByRepo` carve-out are preserved exactly as
today.

---

## Error handling

Unchanged contract. `freeze` validates each field via its descriptor schema and
throws typed `ConfigError` with `Invalid <field>: ...` on failure; enforcement
routes divergences to silent / `warn` / `EnforcementError`. No new error types.
Enum fields gain precise messages for free via `Schema.Literal` unions.

---

## Testing

1. **Table-driven suite** iterates `DESCRIPTORS`. For each field, assert:
   - the schema accepts every `samples.valid` and rejects every
     `samples.invalid`;
   - `strategy` is a real key in `STRATEGY_TABLE`;
   - merge behavior matches the strategy contract for the field's type
     (scalar → local wins; array → union+sort; record → child-wins).
   Samples live in the descriptor entry, so coverage cannot lag the table.
2. **Bespoke unit tests** for special cases: `excludeByRepo` refine, the
   security-divergence `warn` boxes, and `catalogs` / `overrides` /
   `peerDependencyRules` override detection — extending existing `__test__`
   patterns.
3. **Parity suite unchanged**: the migrated 14 fields must still produce
   byte-identical output vs. Silk's oracle. Green parity proves the migration
   changed no behavior.
4. **Type-level test**: the hybrid assertion above.

---

## Deliverables

1. **Descriptor table + category modules** under `package/src/descriptors/`,
   with `FIELD_SCHEMAS` / `FIELD_REGISTRY` derived from it.
2. **Migrated 14 fields** (parity-locked) + **new fields** per the matrix.
3. **Hand-authored `PluginConfig`** with JSDoc + the type-level drift
   assertion.
4. **Test suites** (table-driven + bespoke + type-level); parity stays green.
5. **Coverage matrix in design docs** — mirror the matrix below into
   `.claude/design/rolldown-pnpm-config/settings-coverage.md`, kept current as
   the registry grows.
6. **User-facing docs** — a GitHub markdown page under `docs/` (not rspress)
   listing supported vs. unsupported fields, each deep-linking to
   `https://pnpm.io/settings#<anchor>` (`confirmModulesPurge` flagged as
   undocumented upstream).

---

## Coverage Matrix

Anchors are `https://pnpm.io/settings#<key-lowercased>`. Enforcement/strategy
columns describe the **default**; authors may override enforcement per field.

### Covered — parity-locked (14)

See the migration table above. These keep their existing strategy/enforcement.

### Covered — new fields

Default strategy/enforcement shown. "sec" = security default `warn`.

#### Dependency resolution

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `ignoredOptionalDependencies` | array | `arrayUnion` | absent |
| `updateConfig` | object | `mapChildWins` | absent |
| `catalog` | object | `mapChildWins` | warn |

#### Supply chain / trust (sec)

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `minimumReleaseAgeStrict` | boolean | `scalar` | warn |
| `minimumReleaseAgeIgnoreMissingTime` | boolean | `scalar` | warn |
| `trustPolicy` | enum `off`/`no-downgrade` | `scalar` | warn |
| `trustPolicyExclude` | array | `arrayUnion` | warn |
| `trustPolicyIgnoreAfter` | number | `scalar` | warn |
| `trustLockfile` | boolean | `scalar` | warn |

#### Hoisting

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `hoist` | boolean | `scalar` | absent |
| `hoistWorkspacePackages` | boolean | `scalar` | absent |
| `hoistPattern` | array | `arrayUnion` | absent |
| `shamefullyHoist` | boolean | `scalar` | absent |
| `hoistingLimits` | enum `node`/`workspaces`/`dependencies` | `scalar` | absent |

#### Node-modules

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `modulesDir` | string | `scalar` | absent |
| `nodeLinker` | enum `isolated`/`hoisted`/`pnp` | `scalar` | absent |
| `symlink` | boolean | `scalar` | absent |
| `enableModulesDir` | boolean | `scalar` | absent |
| `virtualStoreDir` | string | `scalar` | absent |
| `virtualStoreDirMaxLength` | number | `scalar` | absent |
| `virtualStoreOnly` | boolean | `scalar` | absent |
| `packageImportMethod` | enum `auto`/`hardlink`/`copy`/`clone`/`clone-or-copy` | `scalar` | absent |
| `modulesCacheMaxAge` | number | `scalar` | absent |
| `dlxCacheMaxAge` | number | `scalar` | absent |

#### Store integrity (sec)

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `verifyStoreIntegrity` | boolean | `scalar` | warn |
| `strictStorePkgContentCheck` | boolean | `scalar` | warn |

#### Lockfile

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `lockfile` | boolean | `scalar` | absent |
| `preferFrozenLockfile` | boolean | `scalar` | absent |
| `lockfileIncludeTarballUrl` | boolean | `scalar` | absent |
| `gitBranchLockfile` | boolean | `scalar` | absent |
| `mergeGitBranchLockfilesBranchPattern` | array or null | `arrayUnion` | absent |
| `peersSuffixMaxLength` | number | `scalar` | absent |
| `sharedWorkspaceLockfile` | boolean | `scalar` | absent |

#### Peers

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `autoInstallPeers` | boolean | `scalar` | absent |
| `dedupePeerDependents` | boolean | `scalar` | absent |
| `dedupePeers` | boolean | `scalar` | absent |
| `strictPeerDependencies` | boolean | `scalar` | absent |
| `resolvePeersFromWorkspaceRoot` | boolean | `scalar` | absent |

#### Build / scripts

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `onlyBuiltDependencies` | array | `arrayUnion` | warn (sec) |
| `onlyBuiltDependenciesFile` | string | `scalar` | warn (sec) |
| `neverBuiltDependencies` | array | `arrayUnion` | absent |
| `ignoredBuiltDependencies` | array | `arrayUnion` | absent |
| `dangerouslyAllowAllBuilds` | boolean | `scalar` | warn (sec) |
| `ignoreScripts` | boolean | `scalar` | absent |
| `ignoreDepScripts` | boolean | `scalar` | absent |
| `childConcurrency` | number | `scalar` | absent |
| `sideEffectsCache` | boolean | `scalar` | absent |
| `sideEffectsCacheReadonly` | boolean | `scalar` | absent |
| `nodeOptions` | string | `scalar` | absent |
| `verifyDepsBeforeRun` | enum `install`/`warn`/`error`/`prompt`/`false` | `scalar` | absent |
| `enablePrePostScripts` | boolean | `scalar` | absent |
| `scriptShell` | string | `scalar` | absent |
| `shellEmulator` | boolean | `scalar` | absent |
| `requiredScripts` | array | `arrayUnion` | absent |

#### Patches

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `patchedDependencies` | object | `mapChildWins` | warn |
| `allowUnusedPatches` | boolean | `scalar` | absent |
| `allowNonAppliedPatches` | boolean | `scalar` | absent |
| `ignorePatchFailures` | boolean | `scalar` | absent |
| `patchesDir` | string | `scalar` | absent |

#### Config / exec / injection

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `configDependencies` | object | `mapChildWins` | absent |
| `executionEnv` | object | `mapChildWins` | absent |
| `injectWorkspacePackages` | boolean | `scalar` | absent |
| `syncInjectedDepsAfterScripts` | array | `arrayUnion` | absent |
| `dedupeInjectedDeps` | boolean | `scalar` | absent |

#### Package-manager version policy

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `packageManagerStrict` | boolean | `scalar` | absent |
| `packageManagerStrictVersion` | boolean | `scalar` | absent |
| `managePackageManagerVersions` | boolean | `scalar` | absent |
| `pmOnFail` | enum `download`/`error`/`warn`/`ignore` | `scalar` | absent |
| `runtimeOnFail` | enum `download`/`error`/`warn`/`ignore` | `scalar` | absent |

#### Node version

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `nodeVersion` | string | `scalar` | absent |
| `useNodeVersion` | string | `scalar` | absent |
| `nodeDownloadMirrors` | object | `mapChildWins` | absent |

#### Catalog

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `catalogMode` | enum `strict`/`prefer`/`manual` | `scalar` | absent |
| `cleanupUnusedCatalogs` | boolean | `scalar` | absent |

#### Workspace

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `linkWorkspacePackages` | boolean or `deep` | `scalar` | absent |
| `preferWorkspacePackages` | boolean | `scalar` | absent |
| `saveWorkspaceProtocol` | boolean or `rolling` | `scalar` | absent |
| `includeWorkspaceRoot` | boolean | `scalar` | absent |
| `ignoreWorkspaceCycles` | boolean | `scalar` | absent |
| `disallowWorkspaceCycles` | boolean | `scalar` | absent |
| `workspaceConcurrency` | number | `scalar` | absent |

#### Audit

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `auditLevel` | enum `low`/`moderate`/`high`/`critical` | `scalar` | absent |

#### Resolution / misc preferences

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `resolutionMode` | enum `highest`/`time-based`/`lowest-direct` | `scalar` | absent |
| `savePrefix` | enum `^`/`~`/`` | `scalar` | absent |
| `saveExact` | boolean | `scalar` | absent |
| `tag` | string | `scalar` | absent |
| `preferOffline` | boolean | `scalar` | absent |
| `dedupeDirectDeps` | boolean | `scalar` | absent |
| `deployAllFiles` | boolean | `scalar` | absent |
| `forceLegacyDeploy` | boolean | `scalar` | absent |
| `extendNodePath` | boolean | `scalar` | absent |
| `preferSymlinkedExecutables` | boolean | `scalar` | absent |
| `ignoreCompatibilityDb` | boolean | `scalar` | absent |
| `optimisticRepeatInstall` | boolean | `scalar` | absent |
| `recursiveInstall` | boolean | `scalar` | absent |
| `engineStrict` | boolean | `scalar` | absent |

#### Network tuning (opted in)

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `networkConcurrency` | number | `scalar` | absent |
| `fetchRetries` | number | `scalar` | absent |
| `fetchRetryFactor` | number | `scalar` | absent |
| `fetchRetryMintimeout` | number | `scalar` | absent |
| `fetchRetryMaxtimeout` | number | `scalar` | absent |
| `fetchTimeout` | number | `scalar` | absent |
| `gitShallowHosts` | array | `arrayUnion` | absent |

#### Publish (opted in)

| key | type | strategy | enforce |
| --- | --- | --- | --- |
| `provenance` | boolean | `scalar` | absent |
| `gitChecks` | boolean | `scalar` | absent |
| `embedReadme` | boolean | `scalar` | absent |
| `publishBranch` | string | `scalar` | absent |

### Not covered (with reason)

| key(s) | reason |
| --- | --- |
| `packages` | workspace package globs, not a tunable setting (managed separately) |
| `registry`, `registries`, `registrySupportsTimeField` | registry config (machine/org-specific) |
| `ca`, `cafile`, `cert`, `key` | TLS material (machine/secret) |
| `proxy`, `httpsProxy`, `noproxy`, `localAddress`, `maxsockets`, `strictSsl` | proxy / network transport (machine-specific) |
| `color`, `loglevel`, `reporter`, `useStderr`, `updateNotifier`, `useBetaCli` | CLI / reporter / user-env output |
| `npmPath`, `npmrcAuthFile` | external tool path / auth file (machine-specific) |
| `storeDir`, `cacheDir`, `stateDir`, `globalDir`, `globalBinDir` | filesystem locations (machine-specific) |
| `pnpmfile`, `globalPnpmfile`, `ignorePnpmfile` | pnpmfile meta (self-referential to this plugin) |
| `unsafePerm` | UID/GID switching (machine/privilege) |
| `ignoreWorkspaceRootCheck`, `failIfNoMatch` | CLI invocation behavior |
| `enableGlobalVirtualStore`, `nodeExperimentalPackageMap`, `nodePackageMapType`, `useRunningStoreServer`, `frozenStore` | experimental / niche-daemon flags |

> Note: the schemastore schema may lag pnpm releases. Any key present in
> pnpm.io but absent from schemastore (or vice versa) is reconciled in favor of
> pnpm.io and noted inline in `settings-coverage.md`.

---

## Open questions / risks

- **`catalog` (singular)** may deserve a dedicated override-detecting strategy
  mirroring `catalogs`; default is `mapChildWins`/`warn` until implementation
  confirms.
- **Nested-object merge depth** for `updateConfig`, `executionEnv`,
  `configDependencies`: `mapChildWins` is shallow. Confirm per field that
  shallow child-wins is correct.
- **enum unions in `Schema.Literal`** must exactly match pnpm's accepted values;
  validate against pnpm.io at implementation time (schemastore may differ).
- **Derived-type ergonomics**: if `Schema.Schema.Type` produces awkward hover
  types, the hand-authored interface remains the author-facing surface; the
  assertion only needs structural equality.
