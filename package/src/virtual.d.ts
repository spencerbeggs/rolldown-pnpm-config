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
	// Inlined rather than imported from "rolldown-pnpm-config/runtime": this file is
	// shipped byte-for-byte (never compiled), so any cross-module import here resolves
	// against this package's own *source* `exports` map during the build's declaration
	// pass and pulls a raw .ts file into API Extractor's analysis (ae-wrong-input-file-type).
	// Keep this shape in sync with `PnpmConfig`/`PnpmHooks` in `src/runtime/types.ts`.
	interface PnpmConfig {
		catalogs?: Record<string, Record<string, string>>;
		[key: string]: unknown;
	}
	export const hooks: {
		updateConfig(config: PnpmConfig): PnpmConfig;
	};
}

declare module "rolldown-pnpm-config/virtual/catalogs" {
	export const catalogs: Map<string, Map<string, string>>;
}
