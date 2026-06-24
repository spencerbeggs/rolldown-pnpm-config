import { describe, expect, it } from "vitest";
import { defineCatalogs } from "../src/define-catalogs.js";

describe("defineCatalogs", () => {
	it("normalizes string and object package specs to ranges", () => {
		const result = defineCatalogs([{ name: "silk", packages: { typescript: "^5.9.0", vitest: { range: "^4.0.0" } } }]);
		expect(result.catalogs).toEqual({ silk: { typescript: "^5.9.0", vitest: "^4.0.0" } });
	});

	it("emits a pass-through <name>Peers copy when peers is true", () => {
		const result = defineCatalogs([{ name: "silk", peers: true, packages: { typescript: "^5.9.0" } }]);
		expect(result.catalogs.silkPeers).toEqual({ typescript: "^5.9.0" });
	});

	it("omits the peers catalog when peers is absent", () => {
		const result = defineCatalogs([{ name: "silk", packages: { a: "1.0.0" } }]);
		expect(result.catalogs.silkPeers).toBeUndefined();
	});
});
