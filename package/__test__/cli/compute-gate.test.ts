import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { computeGate } from "../../src/cli/commands/upgrade.js";
import { ResolveError } from "../../src/cli/resolve.js";
import { makeStubResolver } from "./utils/stub-resolver.js";

/** A config that declares a 1440-minute release age and one exclusion. */
const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
	name: "@test/cfg",
	catalogs: {},
	minimumReleaseAge: 1440,
	minimumReleaseAgeExclude: ["@cfg/*"],
});`;

/** A config that declares no release-age gate. */
const BARE_SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: {} });`;

describe("computeGate (config + pnpm settings)", () => {
	it.effect("uses pnpm's own gate when the config declares none", () =>
		Effect.gen(function* () {
			const resolver = makeStubResolver({ pnpmReleaseAge: { ageMinutes: 60, exclude: ["@pnpm/*"] } });
			const gate = yield* computeGate(BARE_SOURCE, "test.ts", resolver);
			expect(gate.ageMinutes).toBe(60);
			expect([...gate.exclude]).toEqual(["@pnpm/*"]);
		}),
	);

	it.effect("combines both sources, keeping the stricter age", () =>
		Effect.gen(function* () {
			const resolver = makeStubResolver({ pnpmReleaseAge: { ageMinutes: 2880 } });
			const gate = yield* computeGate(SOURCE, "test.ts", resolver);
			expect(gate.ageMinutes).toBe(2880);
			expect(gate.exclude).toContain("@cfg/*");
		}),
	);

	it.effect("degrades an unreadable pnpm settings read to the config's gate alone", () =>
		Effect.gen(function* () {
			const resolver = {
				...makeStubResolver({}),
				pnpmReleaseAge: () => Effect.fail(new ResolveError({ pkg: "pnpm-workspace.yaml", message: "bad yaml" })),
			};
			const gate = yield* computeGate(SOURCE, "test.ts", resolver);
			expect(gate.ageMinutes).toBe(1440);
		}),
	);
});
