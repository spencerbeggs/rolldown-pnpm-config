// package/src/descriptors/workspace.ts
import { Schema } from "effect";
import { Bool, Num } from "./schemas.js";
import type { FieldDescriptors } from "./types.js";

/** The 10 catalog + workspace + audit fields. @internal */
export const workspace = {
	catalogMode: {
		schema: Schema.Literal("strict", "prefer", "manual"),
		kind: "enum",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Controls how dependencies are resolved against entries defined in the catalogs field.",
		anchor: "catalogmode",
		samples: { valid: ["manual"], invalid: ["x"] },
	},
	cleanupUnusedCatalogs: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether pnpm removes catalog entries that are not used by any project in the workspace.",
		anchor: "cleanupunusedcatalogs",
	},
	linkWorkspacePackages: {
		schema: Schema.Union(Schema.Boolean, Schema.Literal("deep")),
		kind: "union",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether workspace packages are linked from the workspace, not downloaded from the registry.",
		anchor: "linkworkspacepackages",
		samples: { valid: [true, "deep"], invalid: ["x"] },
	},
	preferWorkspacePackages: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether versions of packages from the workspace are preferred over versions from the registry.",
		anchor: "preferworkspacepackages",
	},
	saveWorkspaceProtocol: {
		schema: Schema.Union(Schema.Boolean, Schema.Literal("rolling")),
		kind: "union",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Controls whether the workspace: range protocol is used when saving workspace package versions.",
		anchor: "saveworkspaceprotocol",
		samples: { valid: [false, "rolling"], invalid: ["x"] },
	},
	includeWorkspaceRoot: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether tasks of the root workspace project are included when executing commands recursively.",
		anchor: "includeworkspaceroot",
	},
	ignoreWorkspaceCycles: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether workspace dependency cycles are silently ignored.",
		anchor: "ignoreworkspacecycles",
	},
	disallowWorkspaceCycles: {
		schema: Bool,
		kind: "boolean",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Whether an error is thrown when a workspace dependency cycle is detected.",
		anchor: "disallowworkspacecycles",
	},
	workspaceConcurrency: {
		schema: Num,
		kind: "number",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Number of projects built in parallel when running commands recursively.",
		anchor: "workspaceconcurrency",
	},
	auditLevel: {
		schema: Schema.Literal("low", "moderate", "high", "critical"),
		kind: "enum",
		strategy: "scalar",
		enforcement: "absent",
		doc: "Minimum severity level for audit reports (low, moderate, high, critical).",
		anchor: "auditlevel",
		samples: { valid: ["low"], invalid: ["x"] },
	},
} satisfies FieldDescriptors;
