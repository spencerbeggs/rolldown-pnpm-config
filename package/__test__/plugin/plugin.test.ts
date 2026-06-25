import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { defineCatalogs } from "../../src/define-catalogs.js";
import { definePlugin } from "../../src/define-plugin.js";
import { PnpmConfigPlugin, createPnpmConfigPlugin } from "../../src/plugin/index.js";

const config = definePlugin({ catalogs: defineCatalogs([{ name: "silk", peers: true, packages: { a: "^1.0.0" } }]) });

// rolldown hooks can be a function or an object { handler }; normalize for tests.
const callHook = <T>(hook: unknown, ...args: unknown[]): T => {
	const fn = typeof hook === "function" ? hook : (hook as { handler: (...a: unknown[]) => T }).handler;
	return (fn as (...a: unknown[]) => T).apply({}, args);
};

describe("PnpmConfigPlugin", () => {
	it("resolves the two virtual specifiers to \\0-prefixed ids and nothing else", () => {
		const plugin = PnpmConfigPlugin(config);
		expect(callHook<string | null>(plugin.resolveId, "rolldown-pnpm-config/virtual/pnpmfile")).toBe(
			"\0rolldown-pnpm-config/virtual/pnpmfile",
		);
		expect(callHook<string | null>(plugin.resolveId, "rolldown-pnpm-config/virtual/catalogs")).toBe(
			"\0rolldown-pnpm-config/virtual/catalogs",
		);
		expect(callHook<string | null>(plugin.resolveId, "some-other-package")).toBeNull();
	});

	it("loads the catalogs module as a Map reflecting the config (incl. peers copy)", async () => {
		const plugin = PnpmConfigPlugin(config);
		const src = await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/catalogs");
		expect(src).toContain('["silk", new Map([["a", "^1.0.0"]])]');
		expect(src).toContain('["silkPeers", new Map([["a", "^1.0.0"]])]');
	});

	it("runs freeze exactly once across multiple load calls (memoized across passes)", async () => {
		const freezeSpy = vi.fn((c: typeof config) =>
			Effect.succeed({
				base: { catalogs: c.catalogs.catalogs },
				manifest: { catalogs: { strategy: "catalogs", enforcement: "warn" as const } },
			}),
		);
		const plugin = createPnpmConfigPlugin(config, { freeze: freezeSpy });
		await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/pnpmfile");
		await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/catalogs");
		await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/pnpmfile");
		expect(freezeSpy).toHaveBeenCalledTimes(1);
	});
});
