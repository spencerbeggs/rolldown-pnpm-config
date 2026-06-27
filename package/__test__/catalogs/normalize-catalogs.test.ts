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
		expect(out.silkPeers).toBeUndefined();
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
		expect(out.silkPeers).toEqual({ vitest: "^4.2.0", effect: "^3.0.0" });
	});

	it("emits no peer entry for a package with strategy but no materialized peer", () => {
		const out = normalizeCatalogs({
			silk: { packages: { vitest: { range: "^4.2.3", strategy: "lock-minor" } } },
		});
		expect(out.silkPeers).toBeUndefined();
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
