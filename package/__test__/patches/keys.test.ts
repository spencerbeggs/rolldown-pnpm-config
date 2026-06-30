import { describe, expect, it } from "vitest";
import { patchKeyFromFileName } from "../../src/patches/keys.js";

describe("patchKeyFromFileName", () => {
	it("derives an exact-version key", () => {
		expect(patchKeyFromFileName("is-odd@3.0.1.patch")).toBe("is-odd@3.0.1");
	});
	it("unmangles a scoped name's __ back to /", () => {
		expect(patchKeyFromFileName("@scope__pkg@1.0.0.patch")).toBe("@scope/pkg@1.0.0");
	});
	it("derives a bare (all-versions) key", () => {
		expect(patchKeyFromFileName("react.patch")).toBe("react");
	});
	it("returns null for a non-.patch file", () => {
		expect(patchKeyFromFileName("notes.txt")).toBeNull();
	});
	it("returns null for an empty stem", () => {
		expect(patchKeyFromFileName(".patch")).toBeNull();
	});
});
