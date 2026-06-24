declare module "rolldown-pnpm-config/virtual/pnpmfile" {
	import type { PnpmHooks } from "rolldown-pnpm-config/runtime";
	export const hooks: PnpmHooks;
}

declare module "rolldown-pnpm-config/virtual/catalogs" {
	export const catalogs: Map<string, Map<string, string>>;
}
