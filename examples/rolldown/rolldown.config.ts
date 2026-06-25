import { defineConfig } from "rolldown";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";
import { plugin } from "./pnpm-config.js";

export default defineConfig({
	input: "src/pnpmfile.ts",
	// The emitted pnpmfile runs under Node in the consuming repo, so target node:
	// this externalizes `node:*` builtins instead of trying to bundle them.
	platform: "node",
	output: { file: "pnpmfile.mjs", format: "esm" },
	plugins: [PnpmConfigPlugin(plugin)],
});
