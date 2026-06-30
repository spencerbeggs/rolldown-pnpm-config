# Required config `name` + de-silk the runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required top-level `name` to `PluginConfig` that the bundled runtime carries so warnings attribute themselves with a `[<name>]` tag, and remove every "silk" reference from the runtime (warning strings, `Divergence` field names `silkValue`/`childValue` → `managedValue`/`localValue`, `detail` strings, internal vars/comments).

**Architecture:** `name` is validated in `freeze` (the validation gate) and returned alongside `{ base, manifest }`; `serialize.emitPnpmfileModule` bakes it into the pnpmfile virtual module as a literal third arg to `createHooks(base, manifest, name)`; the runtime passes it to `formatOverrideWarning`/`formatSecurityWarning`. The de-silk is a mechanical rename + string rewrite across `runtime/`.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, Effect Schema, Vitest (forks), Biome.

**Spec:** `.claude/design/rolldown-pnpm-config/specs/2026-06-29-config-name-and-de-silk-design.md`

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:`; type-only imports MUST use `import type`.
- No import cycles (Biome `noImportCycles` is an error).
- All tests live in `package/__test__/`, never `src/`. Unit `*.test.ts`, integration `*.int.test.ts`, type tests `*.test-d.ts`.
- `exactOptionalPropertyTypes` ON: conditional spreads, never assign `undefined`.
- `name` is metadata: NEVER added to `base`, `manifest`, or any pnpm setting; it flows only to the runtime warnings.
- `name` is REQUIRED: a missing/empty `name` is a typed `ConfigError` from `freeze`.
- The runtime stays dependency-free (it only carries the baked-in name string).
- Run a single test file: `pnpm vitest run <path>`. Use the shell, never an MCP test tool.
- Commits: Conventional Commits + `Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>`.

---

## File Structure

Modified:

- `package/src/define-plugin.ts` — add required `name: string` to `PluginConfig`.
- `package/src/plugin/freeze.ts` — validate `name`; return `{ base, manifest, name }`.
- `package/src/plugin/index.ts` — `Frozen` type gains `name`; pass it to `emitPnpmfileModule`.
- `package/src/plugin/serialize.ts` — `emitPnpmfileModule(base, manifest, name)` emits the name literal.
- `package/src/runtime/index.ts` — `createHooks(base, manifest, name)` → formatters.
- `package/src/runtime/warnings.ts` — `name` param, `[<name>]` tag, generic wording.
- `package/src/runtime/types.ts` — `Divergence` field rename.
- `package/src/runtime/strategies/{catalogs,overrides,scalar}.ts` — renamed fields, de-silked `detail` strings + locals.
- `package/src/runtime/ctx.ts` — de-silked comments.
- Example configs + test fixtures — add `name`.
- Tests: `plugin-config.test-d.ts`, `freeze` test(s), `warnings` test, `serialize` test, strategy tests, a de-silk guard test.

---

## Task 1: Required `name` field (type + freeze + all configs green)

**Files:**

- Modify: `package/src/define-plugin.ts`, `package/src/plugin/freeze.ts`, `package/src/plugin/index.ts`
- Modify: `package/__test__/types/plugin-config.test-d.ts` (drift-guard exclusion)
- Modify: every `PnpmConfigPlugin({...})` call (examples + test config sources)
- Test: `package/__test__/` freeze test (find the existing freeze test file)

**Interfaces:**

- Produces: `PluginConfig.name: string` (required); `freeze(config): Effect<{ base: Base; manifest: Manifest; name: string }, ConfigError>`; `Frozen` type gains `readonly name: string`.

- [ ] **Step 1: Find the freeze test + all config call sites**

Run:

```bash
grep -rln "PnpmConfigPlugin(" package/__test__ examples
grep -rln "freeze(" package/__test__
ls package/__test__/plugin 2>/dev/null; ls package/__test__/*.test.ts | grep -i freeze
```

Expected: a freeze test file (e.g. `package/__test__/plugin/freeze.test.ts`), the example configs (`examples/rolldown/pnpm-config.ts`, `examples/rolldown/rolldown.config.ts`, `examples/savvy/savvy.build.ts`), and test config sources (`export.int.test.ts`, `preview.int.test.ts`, freeze test). Note them all.

- [ ] **Step 2: Write the failing freeze tests** (add to the freeze test file)

```ts
it("returns the provided name", async () => {
 const cfg = { name: "@acme/cfg", catalogs: {} } as unknown as Parameters<typeof freeze>[0];
 const out = await Effect.runPromise(freeze(cfg));
 expect(out.name).toBe("@acme/cfg");
 expect("name" in out.base).toBe(false);
 expect("name" in out.manifest).toBe(false);
});

it("fails when name is missing or empty", async () => {
 const missing = { catalogs: {} } as unknown as Parameters<typeof freeze>[0];
 const empty = { name: "  ", catalogs: {} } as unknown as Parameters<typeof freeze>[0];
 expect(await Effect.runPromiseExit(freeze(missing)).then((e) => e._tag)).toBe("Failure");
 expect(await Effect.runPromiseExit(freeze(empty)).then((e) => e._tag)).toBe("Failure");
});
```

(Match the freeze test file's existing import of `freeze`, `Effect`, and the `Exit` helper it uses; if it uses `Exit.isFailure`, mirror that instead of `._tag`.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run <freeze test path>`
Expected: FAIL — `out.name` undefined / freeze does not reject missing name.

- [ ] **Step 4: Add the type** — `package/src/define-plugin.ts`

Add as a required member at the top of the `PluginConfig` interface (before the optional fields):

```ts
 /**
  * Identifier for this config dependency, surfaced in runtime warnings as a
  * `[name]` tag. Conventionally the config package's npm name,
  * e.g. `"@acme/pnpm-config"`. Required.
  *
  * @public
  */
 readonly name: string;
```

- [ ] **Step 5: Validate + return in `freeze`** — `package/src/plugin/freeze.ts`

Right after `base.catalogs = …` / `manifest.catalogs = …` and before the `for` field loop, add:

```ts
  if (typeof config.name !== "string" || config.name.trim() === "") {
   return yield* Effect.fail(new ConfigError({ message: "Config `name` is required and must be a non-empty string" }));
  }
```

Change the return type and the final return:

```ts
export function freeze(config: PluginConfig): Effect.Effect<{ base: Base; manifest: Manifest; name: string }, ConfigError> {
```

```ts
  return { base, manifest, name: config.name };
```

- [ ] **Step 6: Update `Frozen` + plugin wiring** — `package/src/plugin/index.ts`

Add `name` to the `Frozen` interface:

```ts
 readonly base: Base;
 readonly manifest: Manifest;
 readonly name: string;
```

The `getFrozen()` destructures stay `{ base, manifest }` for now (catalogs/pnpmfile branches); `name` is carried but unused until Task 3. No other change here.

- [ ] **Step 7: Drift-guard exclusion** — `package/__test__/types/plugin-config.test-d.ts`

Read it; it compares `PluginConfig` keys against descriptor keys with an exclusion set that already contains `catalogs` and `local`. Add `name` to that exclusion set so the guard still passes. (If the mechanism differs, adapt so `name` is treated as a non-descriptor meta key.)

- [ ] **Step 8: Add `name` to every config call site**

For each file found in Step 1, add a `name` to the `PnpmConfigPlugin({...})` call:

- `examples/rolldown/pnpm-config.ts`, `examples/rolldown/rolldown.config.ts` → `name: "@example/rolldown",`
- `examples/savvy/savvy.build.ts` → `name: "@example/savvy",`
- test config source strings (`export.int.test.ts`, `preview.int.test.ts`, freeze test, any other) → add `name: "@test/cfg",` (or a name fitting the test) as the first property inside `PnpmConfigPlugin({ … })`.

This is required because `freeze` now rejects a missing name; integration tests that freeze a config without a name would fail.

- [ ] **Step 9: Run freeze test + full cli/plugin suites + typecheck**

Run: `pnpm vitest run <freeze test path> && pnpm vitest run package/__test__/cli`
Expected: PASS (new freeze tests + existing, now that configs carry a name).

Run: `pnpm run typecheck`
Expected: clean (example configs now satisfy the required `name`).

- [ ] **Step 10: Commit**

```bash
git add -A package examples
git commit -m "feat: require a top-level name on PluginConfig, validated in freeze

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 2: Rename `Divergence` fields + de-silk detail strings

**Files:**

- Modify: `package/src/runtime/types.ts`, `package/src/runtime/strategies/{catalogs,overrides,scalar}.ts`, `package/src/runtime/warnings.ts`
- Test: the strategy test files + `warnings` test (update field references)

**Interfaces:**

- Produces: `Divergence` with `managedValue` (was `silkValue`) and `localValue` (was `childValue`).

- [ ] **Step 1: Rename the type** — `package/src/runtime/types.ts`

```ts
export interface Divergence {
 readonly setting: string;
 readonly managedValue: string;
 readonly localValue: string;
 readonly detail: string;
 readonly kind: "override" | "security";
}
```

- [ ] **Step 2: Update producers** — strategy files

In `package/src/runtime/strategies/catalogs.ts`, `overrides.ts`, `scalar.ts`: rename every `silkValue:` → `managedValue:` and `childValue:` → `localValue:` in the `Divergence` object literals. De-silk the `detail` strings:

- `"Local version overrides the Silk-managed version."` → `"Local version overrides the managed version."`
- `"Disables a security check that Silk enabled."` → `"Disables a security check the managed config enabled."`

Run after editing: `grep -rn "silkValue\|childValue" package/src` → expected: no matches.

- [ ] **Step 3: Update the consumer** — `package/src/runtime/warnings.ts`

Replace `divergence.silkValue` → `divergence.managedValue` and `divergence.childValue` → `divergence.localValue` (do NOT change the box titles/wording yet — that is Task 3).

- [ ] **Step 4: Update tests**

In the strategy test files and the warnings test, rename `silkValue`/`childValue` in any expected `Divergence` objects to `managedValue`/`localValue`, and update any asserted `detail` substring that contained "Silk".

- [ ] **Step 5: Run the affected tests + typecheck**

Run: `pnpm vitest run package/__test__/runtime` (or the specific strategy + warnings test paths)
Expected: PASS.

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add package/src/runtime package/__test__
git commit -m "refactor(runtime): rename Divergence silkValue/childValue to managedValue/localValue

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 3: Thread `name` to warnings + reword the boxes

**Files:**

- Modify: `package/src/plugin/serialize.ts`, `package/src/plugin/index.ts`, `package/src/runtime/index.ts`, `package/src/runtime/warnings.ts`
- Test: `warnings` test, a `serialize` test, a `createHooks` integration test, a de-silk guard test

**Interfaces:**

- Consumes: `freeze` returning `name` (Task 1), renamed `Divergence` (Task 2).
- Produces: `emitPnpmfileModule(base, manifest, name): string`; `createHooks(base: Base, manifest: Manifest, name: string): PnpmHooks`; `formatOverrideWarning(divergences, name): string`; `formatSecurityWarning(divergences, name): string`.

- [ ] **Step 1: Write the failing warnings tests** (update/extend the warnings test)

```ts
import { formatOverrideWarning, formatSecurityWarning } from "../../src/runtime/warnings.js";

const ov = [{ setting: "catalogs.x.foo", managedValue: "^1.0.0", localValue: "^2.0.0", detail: "", kind: "override" as const }];
const sec = [{ setting: "strictDepBuilds", managedValue: "true", localValue: "false", detail: "Disables a security check the managed config enabled.", kind: "security" as const }];

it("override box carries the [name] tag and no 'silk'", () => {
 const out = formatOverrideWarning(ov, "@acme/cfg");
 expect(out).toContain("[@acme/cfg]");
 expect(out).toContain("Managed version:");
 expect(out.toLowerCase()).not.toContain("silk");
});

it("security box carries the [name] tag and managed=/local= wording", () => {
 const out = formatSecurityWarning(sec, "@acme/cfg");
 expect(out).toContain("[@acme/cfg]");
 expect(out).toContain("managed=true -> local=false");
 expect(out.toLowerCase()).not.toContain("silk");
});
```

(Replace the existing warnings test calls that pass only `divergences` — they now require the `name` arg.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run <warnings test path>`
Expected: FAIL — formatters don't accept `name`; output still says "SILK".

- [ ] **Step 3: Rewrite `warnings.ts`**

```ts
import type { Divergence } from "./types.js";

const WARNING_BOX_WIDTH = 75;

function pad(line: string): string {
 return `│${line}${" ".repeat(Math.max(0, WARNING_BOX_WIDTH - line.length - 2))}│`;
}

/**
 * Format override divergences into a prominent warning box for console output,
 * tagged with the emitting config's `name`. `Divergence.setting` is the
 * already-resolved config path, printed directly.
 *
 * @internal
 */
export function formatOverrideWarning(divergences: readonly Divergence[], name: string): string {
 if (divergences.length === 0) return "";
 const border = "─".repeat(WARNING_BOX_WIDTH - 2);
 const lines: string[] = [];
 lines.push(`┌${border}┐`);
 lines.push(pad(`  [${name}]`));
 lines.push(pad("  ⚠️  CATALOG OVERRIDE DETECTED"));
 lines.push(`├${border}┤`);
 lines.push(pad("  The following entries override managed versions:"));
 lines.push(pad(""));
 for (const d of divergences) {
  lines.push(pad(`  ${d.setting}`));
  lines.push(pad(`    Managed version: ${d.managedValue}`));
  lines.push(pad(`    Local override:  ${d.localValue}`));
  lines.push(pad(""));
 }
 lines.push(pad("  Local versions will be used. To use the managed defaults, remove"));
 lines.push(pad("  these entries from your pnpm-workspace.yaml."));
 lines.push(`└${border}┘`);
 return lines.join("\n");
}

/**
 * Format security-loosening divergences into a prominent box, tagged with the
 * emitting config's `name`.
 *
 * @internal
 */
export function formatSecurityWarning(divergences: readonly Divergence[], name: string): string {
 if (divergences.length === 0) return "";
 const border = "─".repeat(WARNING_BOX_WIDTH - 2);
 const lines: string[] = [];
 lines.push(`┌${border}┐`);
 lines.push(pad(`  [${name}]`));
 lines.push(pad("  ⚠️  SECURITY OVERRIDE DETECTED"));
 lines.push(`├${border}┤`);
 lines.push(pad("  The following entries weaken managed security defaults:"));
 lines.push(pad(""));
 for (const d of divergences) {
  lines.push(pad(`  ${d.setting}: managed=${d.managedValue} -> local=${d.localValue}`));
  lines.push(pad(`    ${d.detail}`));
  lines.push(pad(""));
 }
 lines.push(pad("  Local values will be used. Review these before shipping."));
 lines.push(`└${border}┘`);
 return lines.join("\n");
}
```

(This introduces a `pad` helper to DRY the repeated padding; the box output is equivalent to the prior hand-padded lines.)

- [ ] **Step 4: Thread `name` through `createHooks`** — `package/src/runtime/index.ts`

Change the signature to `export function createHooks(base: Base, manifest: Manifest, name: string): PnpmHooks {` and the two formatter calls to `formatOverrideWarning(allOverrides, name)` and `formatSecurityWarning(allSecurity, name)`.

- [ ] **Step 5: Emit `name`** — `package/src/plugin/serialize.ts`

```ts
export function emitPnpmfileModule(base: Record<string, unknown>, manifest: Record<string, unknown>, name: string): string {
 const b = JSON.stringify(sortKeys(base));
 const m = JSON.stringify(sortKeys(manifest));
 return [
  'import { createHooks } from "rolldown-pnpm-config/runtime";',
  `export const hooks = createHooks(${b}, ${m}, ${JSON.stringify(name)});`,
  "",
 ].join("\n");
}
```

- [ ] **Step 6: Pass `name` from the plugin** — `package/src/plugin/index.ts`

In the pnpmfile virtual-module branch: `const { base, manifest, name } = await getFrozen();` then `return emitPnpmfileModule(base, manifest, name);`.

- [ ] **Step 7: Add serialize + createHooks tests**

In the serialize test, assert `emitPnpmfileModule({}, {}, "@acme/cfg")` contains `createHooks(` and `"@acme/cfg")`. In a createHooks test (or the existing runtime integration test), build hooks with a divergence-producing base/manifest and `name`, run `updateConfig`, and assert the captured `console.warn` output contains `[@acme/cfg]`. (Spy on `console.warn`.)

- [ ] **Step 8: Add the de-silk guard test**

```ts
// package/__test__/runtime/no-silk.test.ts
import { describe, expect, it } from "vitest";
import { formatOverrideWarning, formatSecurityWarning } from "../../src/runtime/warnings.js";

describe("runtime is de-silked", () => {
 it("warning output contains no 'silk'", () => {
  const d = [{ setting: "s", managedValue: "1", localValue: "2", detail: "Local version overrides the managed version.", kind: "override" as const }];
  expect(formatOverrideWarning(d, "@acme/cfg").toLowerCase()).not.toContain("silk");
  expect(formatSecurityWarning(d, "@acme/cfg").toLowerCase()).not.toContain("silk");
 });
});
```

- [ ] **Step 9: Run warnings + serialize + runtime + cli suites + typecheck**

Run: `pnpm vitest run package/__test__/runtime package/__test__/plugin package/__test__/cli`
Expected: PASS.

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add package/src package/__test__
git commit -m "feat(runtime): tag warnings with the config name and de-silk the box copy

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 4: Source hygiene — de-silk comments + locals

**Files:**

- Modify: `package/src/runtime/ctx.ts`, `package/src/runtime/strategies/{catalogs,overrides,scalar}.ts`, `package/src/runtime/warnings.ts` (comments only)

**Interfaces:** none (no behavior or signature change).

- [ ] **Step 1: Rename internal `silk` locals**

In `package/src/runtime/strategies/catalogs.ts` and `overrides.ts`, rename the local `const silk = …` (and derived names like `silkVersion`) to `managed` / `managedVersion`. Pure local renames; no exported name changes.

Run after: `grep -rni "silk" package/src` → expected: no matches (case-insensitive).

- [ ] **Step 2: Reword "Ports Silk" comments**

In `ctx.ts`, `warnings.ts`, and the strategy files, reword JSDoc/comments that say "Ports Silk `X`" / "Silk-managed" to drop the proper noun (e.g. "Resolve the consuming repo's root package name." / "Merge overrides, flagging local divergences."). Keep the comments accurate.

- [ ] **Step 2b: Reword the example catalog name in docs/comments if present**

Do NOT touch example *configs'* user catalog keys (a consumer's `catalogs: { silk: … }` is their choice) — only the LIBRARY'S own source comments. (The earlier grep should now return zero hits in `package/src`.)

- [ ] **Step 3: Run the runtime tests + typecheck**

Run: `pnpm vitest run package/__test__/runtime && pnpm run typecheck`
Expected: PASS / clean (no behavior change).

- [ ] **Step 4: Commit**

```bash
git add package/src/runtime
git commit -m "chore(runtime): drop remaining 'silk' references from source comments and locals

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Final verification

- [ ] **Full suite + typecheck + lint + de-silk grep**

Run: `pnpm run typecheck && pnpm run test && pnpm run lint`
Expected: `rolldown-pnpm-config` green with coverage thresholds met; lint exit 0. (If `@example/rolldown` e2e ENOENTs on `pnpmfile.mjs`, build it: `cd examples/rolldown && pnpm exec rolldown -c`, then re-run.)

Run: `grep -rni "silk" package/src`
Expected: no matches.

- [ ] **Manual smoke — rebuild a consumer and inspect the bundle**

Rebuild the dogfood config (`../../savvy-web/systems/packages/pnpm-plugin-silk`) and confirm the emitted `pnpmfile.mjs` calls `createHooks(base, manifest, "<name>")`, contains no "silk", and that a divergence warning renders the `[<name>]` tag.

---

## Notes / out of scope

- Renaming a consumer's user catalog named `silk` — their choice, not the library's.
- Surfacing `name` anywhere other than runtime warnings.
- `upgrade`/`discover` does not freeze, so it does not validate `name`; only type-checked config literals and frozen paths require it.
