import { describe, expect, it } from "vitest";
import { normalizeCatalogs } from "../../src/catalogs.js";

describe("normalizeCatalogs", () => {
	it("resolves bare and object specs to ranges in the base catalog", () => {
		const out = normalizeCatalogs({
			silk: { packages: { typescript: "^5.9.0", vitest: { range: "^4.0.0" } } },
		});
		expect(out.silk).toEqual({ typescript: "^5.9.0", vitest: "^4.0.0" });
	});

	it("omits the peers catalog when no package carries a materialized peer", () => {
		const out = normalizeCatalogs({ silk: { packages: { typescript: "^5.9.0" } } });
		expect(out["silk:peers"]).toBeUndefined();
	});

	it("uses the materialized peer verbatim and ignores strategy", () => {
		const out = normalizeCatalogs({
			silk: {
				packages: {
					typescript: "^5.9.0",
					vitest: { range: "^4.2.3", peer: "^4.2.0", strategy: "lock-minor" },
					effect: { range: "^3.2.0", peer: "^3.0.0" },
				},
			},
		});
		expect(out.silk).toEqual({ typescript: "^5.9.0", vitest: "^4.2.3", effect: "^3.2.0" });
		expect(out["silk:peers"]).toEqual({ vitest: "^4.2.0", effect: "^3.0.0" });
	});

	it("does not emit the legacy camelCase peers name", () => {
		const out = normalizeCatalogs({
			silk: { packages: { vitest: { range: "^4.2.3", peer: "^4.2.0" } } },
		});
		expect(out["silk:peers"]).toEqual({ vitest: "^4.2.0" });
		expect(out.silkPeers).toBeUndefined();
	});

	it("emits no peer entry for a package with strategy but no materialized peer", () => {
		const out = normalizeCatalogs({
			silk: { packages: { vitest: { range: "^4.2.3", strategy: "lock-minor" } } },
		});
		expect(out["silk:peers"]).toBeUndefined();
	});

	it("does not leak the source field into the emitted catalog", () => {
		const out = normalizeCatalogs({
			effected: {
				packages: {
					"@effected/app": { range: "^0.7.0", peer: "^0.7.0", strategy: "lock-minor", source: "workspace" },
				},
			},
		});
		expect(out.effected).toEqual({ "@effected/app": "^0.7.0" });
		expect(out["effected:peers"]).toEqual({ "@effected/app": "^0.7.0" });
	});

	it("ignores a non-catalog sibling key without throwing or emitting a bogus catalog", () => {
		// PIN: a future reserved key inside `catalogs` (e.g. a function-valued
		// callback) must be ignored — the failure mode is "catalog silently not
		// found", indistinguishable from "nothing to update". The typed authoring
		// surface keeps the map pure data, but untyped JS consumers can pass
		// anything.
		const out = normalizeCatalogs({
			// Deliberately violating the type to pin runtime behavior.
			onUpdate: (() => {}) as unknown as Parameters<typeof normalizeCatalogs>[0][string],
			// A declaration with no packages map must also be inert.
			broken: {} as Parameters<typeof normalizeCatalogs>[0][string],
			silk: { packages: { typescript: "^5.9.0" } },
		});
		expect(out.silk).toEqual({ typescript: "^5.9.0" });
		expect(out.onUpdate).toBeUndefined();
		expect(out.broken).toBeUndefined();
		expect(Object.keys(out)).toEqual(["silk"]);
	});

	it("processes two catalogs in a single call independently", () => {
		const out = normalizeCatalogs({
			silk: { packages: { a: "^1.0.0" } },
			react: { packages: { b: "^2.0.0" } },
		});
		expect(out.silk).toEqual({ a: "^1.0.0" });
		expect(out.react).toEqual({ b: "^2.0.0" });
	});
});

describe("normalizeCatalogs: the exact variant", () => {
	it("emits no exact catalog unless the declaration opts in", () => {
		const out = normalizeCatalogs({ effected: { packages: { effect: "~4.1.3" } } });
		expect(out["effected:exact"]).toBeUndefined();
	});

	it("strips the operator from every single-comparator range under <name>:exact", () => {
		const out = normalizeCatalogs({
			effected: {
				exact: true,
				packages: {
					effect: { range: "~4.1.3", peer: "~4.1.0", strategy: "lock-minor" },
					"@effected/npm": "^0.34.0",
					"@effect/tsgo": "0.51.1",
					eq: "=1.2.3",
					floor: ">=2.0.0",
					rc: "^1.0.0-rc.1",
				},
			},
		});
		expect(out["effected:exact"]).toEqual({
			effect: "4.1.3",
			"@effected/npm": "0.34.0",
			"@effect/tsgo": "0.51.1",
			eq: "1.2.3",
			floor: "2.0.0",
			rc: "1.0.0-rc.1",
		});
		// Out of scope: the base and peers catalogs are untouched.
		expect(out.effected).toEqual({
			effect: "~4.1.3",
			"@effected/npm": "^0.34.0",
			"@effect/tsgo": "0.51.1",
			eq: "=1.2.3",
			floor: ">=2.0.0",
			rc: "^1.0.0-rc.1",
		});
		expect(out["effected:peers"]).toEqual({ effect: "~4.1.0" });
	});

	it.each([">=1 <2", "1.2.3 || 2.0.0", "*", "latest", "1.x", "^1.2", "<2.0.0", ">1.0.0", "workspace:^"])(
		"fails loudly on %j, which names no single version",
		(range) => {
			expect(() => normalizeCatalogs({ c: { exact: true, packages: { ok: "^1.0.0", wide: range } } })).toThrow(
				/catalog "c".*"wide".*no single version/,
			);
		},
	);

	it("takes an explicit exact value for a range that names no single version", () => {
		const out = normalizeCatalogs({
			c: { exact: true, packages: { wide: { range: ">=1.2.0 <2.0.0", exact: "1.4.2" } } },
		});
		expect(out["c:exact"]).toEqual({ wide: "1.4.2" });
		expect(out.c).toEqual({ wide: ">=1.2.0 <2.0.0" });
	});

	it("leaves out an entry marked exact: false", () => {
		const out = normalizeCatalogs({
			c: { exact: true, packages: { a: "^1.0.0", wide: { range: "*", exact: false } } },
		});
		expect(out["c:exact"]).toEqual({ a: "1.0.0" });
	});

	it("rejects an explicit exact value on a derivable range, which upgrade would leave stale", () => {
		expect(() =>
			normalizeCatalogs({ c: { exact: true, packages: { a: { range: "^1.0.0", exact: "1.0.0" } } } }),
		).toThrow(/"a".*derives its exact version/);
	});

	it.each(["^1.2", "~1.2", "1.x", "1"])(
		"rejects an explicit exact value on %j, a partial range upgrade rewrites, so the build survives an upgrade",
		(range) => {
			expect(() => normalizeCatalogs({ c: { exact: true, packages: { a: { range, exact: "1.2.0" } } } })).toThrow(
				/"a".*which upgrade rewrites/,
			);
		},
	);

	it("asks for a full version, not an exact value, on a partial range with no escape", () => {
		expect(() => normalizeCatalogs({ c: { exact: true, packages: { a: "^1.2" } } })).toThrow(
			/"a" has range "\^1\.2".*write the range as a full version/,
		);
	});

	it("rejects an explicit exact value that is not a plain version", () => {
		expect(() => normalizeCatalogs({ c: { exact: true, packages: { a: { range: "*", exact: "^1.0.0" } } } })).toThrow(
			/"a".*not a plain version/,
		);
	});

	it("rejects a per-entry exact on a catalog that has not opted in", () => {
		expect(() => normalizeCatalogs({ c: { packages: { a: { range: "*", exact: false } } } })).toThrow(
			/catalog "c".*does not set exact: true/,
		);
	});

	it("emits no exact catalog when every entry is left out", () => {
		const out = normalizeCatalogs({ c: { exact: true, packages: { a: { range: "*", exact: false } } } });
		expect(out["c:exact"]).toBeUndefined();
	});
});
