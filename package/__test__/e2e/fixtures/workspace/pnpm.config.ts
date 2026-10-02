import { PnpmConfigPlugin } from "rolldown-pnpm-config";

export const plugin = PnpmConfigPlugin({
	name: "@e2e/config",
	catalogs: { default: { packages: { typescript: "^5.9.0" } } },
	publicHoistPattern: ["@types/*"],
});
