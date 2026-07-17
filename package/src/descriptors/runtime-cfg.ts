// package/src/descriptors/runtime-cfg.ts
import { Schema } from "effect";
import { Bool, Str, UnknownRecord } from "./schemas.js";
import type { FieldDescriptors } from "./types.js";

/** The 8 package-manager version + node-version fields. @internal */
export const runtimeCfg = {
	packageManagerStrict: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether pnpm enforces use of the package manager specified in packageManager.",
		workspaceYaml: true,
		anchor: "packagemanagerstrict",
	},
	packageManagerStrictVersion: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether pnpm enforces the exact version of the package manager specified in packageManager.",
		workspaceYaml: true,
		anchor: "packagemanagerstrictversion",
	},
	managePackageManagerVersions: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether pnpm automatically downloads and uses the version of pnpm specified in packageManager.",
		workspaceYaml: true,
		anchor: "managepackagemanagerversions",
	},
	pmOnFail: {
		schema: Schema.Literals(["download", "error", "warn", "ignore"]),
		kind: "enum",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Action taken when the package manager version does not match the packageManager field.",
		workspaceYaml: true,
		anchor: "pmonfail",
		samples: { valid: ["download"], invalid: ["x"] },
	},
	runtimeOnFail: {
		schema: Schema.Literals(["download", "error", "warn", "ignore"]),
		kind: "enum",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Action taken when the Node.js version does not match the engines.node field.",
		workspaceYaml: true,
		anchor: "runtimeonfail",
		samples: { valid: ["error"], invalid: ["x"] },
	},
	nodeVersion: {
		schema: Str,
		kind: "string",
		strategy: "scalar",
		enforcement: "absent",
		doc: "The Node.js version to use when checking packages' engines field.",
		workspaceYaml: true,
		anchor: "nodeversion",
	},
	useNodeVersion: {
		schema: Str,
		kind: "string",
		strategy: "scalar",
		enforcement: "absent",
		doc: "The exact Node.js version that pnpm should use for running scripts.",
		workspaceYaml: true,
		anchor: "usenodeversion",
	},
	nodeDownloadMirrors: {
		schema: UnknownRecord,
		kind: "unknownRecord",
		strategy: "mapChildWins",
		enforcement: "absent",
		doc: "Mirror URLs for downloading Node.js, keyed by distribution name.",
		workspaceYaml: true,
		anchor: "nodedownloadmirrors",
	},
} satisfies FieldDescriptors;
