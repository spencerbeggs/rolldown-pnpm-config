import { Effect } from "effect";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { freeze } from "../../src/plugin/freeze.js";
import { createHooks } from "../../src/runtime/index.js";
import { silkConfig } from "./silk.config.js";

let our: { updateConfig(c: Record<string, unknown>): Record<string, unknown> };

beforeAll(async () => {
	const { base, manifest } = await Effect.runPromise(freeze(silkConfig));
	our = createHooks(base, manifest);
});

afterEach(() => vi.restoreAllMocks());

describe("warning-box presence parity", () => {
	it("fires an override box when a catalog entry is overridden", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		our.updateConfig({ catalogs: { silk: { typescript: "5.0.0" } } });
		expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("CATALOG OVERRIDE DETECTED");
	});

	it("fires a security box when a security flag is loosened", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		our.updateConfig({ strictDepBuilds: false });
		expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("SECURITY OVERRIDE DETECTED");
	});

	it("is silent when the local config matches Silk", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		our.updateConfig({});
		expect(warn).not.toHaveBeenCalled();
	});
});
