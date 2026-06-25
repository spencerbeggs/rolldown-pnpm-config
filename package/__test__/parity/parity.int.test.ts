import { Effect } from "effect";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { freeze } from "../../src/plugin/freeze.js";
import { createHooks } from "../../src/runtime/index.js";
import { INPUTS } from "./inputs.js";
import { loadSilkOracle } from "./oracle.js";
import { silkConfig } from "./silk.config.js";

let our: { updateConfig(c: Record<string, unknown>): Record<string, unknown> };
const silk = loadSilkOracle();

beforeAll(async () => {
	const { base, manifest } = await Effect.runPromise(freeze(silkConfig));
	our = createHooks(base, manifest);
});

afterEach(() => vi.restoreAllMocks());

describe("Silk merge parity (differential)", () => {
	it.runIf(silk !== null).each(INPUTS)("matches Silk for input %#", (input) => {
		if (!silk) return; // narrows type for TS; runIf already gates execution
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const ours = our.updateConfig(structuredClone(input));
		const theirs = silk.updateConfig(structuredClone(input));
		expect(ours).toEqual(theirs);
	});

	it("oracle is present (build Silk if this fails)", () => {
		expect(silk, "Silk oracle pnpmfile not found — run `pnpm -C <silk> run build`").not.toBeNull();
	});
});
