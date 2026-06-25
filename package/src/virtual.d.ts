// Ambient module declarations for the virtual modules served by PnpmConfigPlugin.
//
// Consumers opt into these types with a single reference directive in their build
// entry or a types/*.d.ts file:
//
//   /// <reference types="rolldown-pnpm-config/virtual" />
//
// After that, imports from the virtual module paths type-check with no additional
// per-module boilerplate.

declare module "rolldown-pnpm-config/virtual/pnpmfile" {
	import type { PnpmHooks } from "rolldown-pnpm-config/runtime";
	export const hooks: PnpmHooks;
}

declare module "rolldown-pnpm-config/virtual/catalogs" {
	export const catalogs: Map<string, Map<string, string>>;
}
