import { describe, expect, it } from "vitest";
import { defineCatalogs } from "../src/define-catalogs.js";
import { definePlugin } from "../src/define-plugin.js";

describe("definePlugin", () => {
	it("carries the catalogs through", () => {
		const catalogs = defineCatalogs([{ name: "silk", packages: { a: "1.0.0" } }]);
		const config = definePlugin({ catalogs });
		expect(config.catalogs).toBe(catalogs);
	});
});
