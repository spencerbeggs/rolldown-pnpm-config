import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { freeze } from "../../src/plugin/freeze.js";
import { createHooks } from "../../src/runtime/index.js";

describe("createHooks engine", () => {
	it("merges catalogs via the catalogs strategy (M1 parity)", () => {
		const base = { catalogs: { silk: { a: "1.0.0", b: "2.0.0" } } };
		const manifest = { catalogs: { strategy: "catalogs", enforcement: "warn" as const } };
		const out = createHooks(base, manifest, "@acme/cfg").updateConfig({
			catalogs: { silk: { b: "9.9.9", c: "3.0.0" } },
		});
		expect(out.catalogs).toEqual({ silk: { a: "1.0.0", b: "9.9.9", c: "3.0.0" } });
	});

	it("applies a quiet scalar field (dedupeDirectDeps) silently, child wins", () => {
		const base = { dedupeDirectDeps: true };
		const manifest = { dedupeDirectDeps: { strategy: "scalar", enforcement: "absent" as const } };
		expect(createHooks(base, manifest, "@acme/cfg").updateConfig({}).dedupeDirectDeps).toBe(true);
		expect(createHooks(base, manifest, "@acme/cfg").updateConfig({ dedupeDirectDeps: false }).dedupeDirectDeps).toBe(
			false,
		);
	});

	it("omits a field whose merged value is undefined/empty", () => {
		const out = createHooks({}, {}, "@acme/cfg").updateConfig({ dir: "/x" });
		expect(out.dir).toBe("/x");
	});

	it("applies the excludeByRepo refine from manifest options against the resolved root name", () => {
		const base = { publicHoistPattern: ["@x/cli", "@types/*"] };
		const manifest = {
			publicHoistPattern: {
				strategy: "arrayUnion",
				enforcement: "absent" as const,
				options: { excludeByRepo: { "x-repo": ["@x/cli"] } },
			},
		};
		const out = createHooks(base, manifest, "@acme/cfg").updateConfig({ rootProjectManifest: { name: "x-repo" } });
		expect(out.publicHoistPattern).toEqual(["@types/*"]);
	});
});

describe("createHooks audit section (the pnpmfile freeze ships)", () => {
	it("keeps the managed and the consumer's audit.ignore, and the consumer's audit.level", async () => {
		const { base, manifest } = await Effect.runPromise(
			freeze({ name: "@acme/cfg", catalogs: {}, audit: { level: "high", ignore: ["GHSA-managed"] } }),
		);
		const out = createHooks(base, manifest, "@acme/cfg").updateConfig({
			audit: { level: "low", ignore: ["GHSA-local"] },
		});
		expect(out.audit).toEqual({ ignore: ["GHSA-local", "GHSA-managed"], level: "low" });
	});
});
