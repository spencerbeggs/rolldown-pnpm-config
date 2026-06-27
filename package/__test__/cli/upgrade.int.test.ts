import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runUpgrade } from "../../src/cli/commands/upgrade.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: {
  silk: {
   packages: {
    typescript: "^5.9.0",
    vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
   },
  },
 },
});
`;

const resolver = {
	versions: (pkg: string) =>
		Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3", "6.0.0"] : ["4.0.0", "4.2.3", "5.0.0"]),
};

describe("runUpgrade (non-interactive)", () => {
	it("rewrites ranges to latest-in-range and recomputes peer, never crossing a major", async () => {
		const file = writeTmpConfig(SOURCE);
		const out = await Effect.runPromise(runUpgrade({ file, resolver }));
		const result = readFileSync(file, "utf8");
		// typescript ^5.9.0 -> ^5.9.3 (not 6.0.0)
		expect(result).toContain('typescript: "^5.9.3"');
		// vitest range ^4.0.0 -> ^4.2.3, peer recomputed via lock-minor -> ^4.2.0
		expect(result).toContain('range: "^4.2.3"');
		expect(result).toContain('peer: "^4.2.0"');
		expect(result).not.toContain("6.0.0");
		expect(out.updated).toBe(2);
	});
});
