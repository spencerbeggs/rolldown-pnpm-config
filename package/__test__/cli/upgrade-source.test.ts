import { fileURLToPath } from "node:url";
import { ReleaseAgeGate } from "@effected/npm";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { resolveGatedVersions } from "../../src/cli/commands/upgrade.js";
import { discoverCatalogEntries } from "../../src/cli/discover.js";
import type { CatalogEntry } from "../../src/cli/types.js";
import { versionKeyOf } from "../../src/cli/version-key.js";
import { makeWorkspaceResolver } from "../../src/cli/workspace-resolve.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));

/** A registry resolver that records calls and fails everything — proving it is never consulted. */
function trackingRegistry() {
	const calls: string[] = [];
	return {
		calls,
		versions: (pkg: string) => {
			calls.push(`versions:${pkg}`);
			return Effect.fail(new Error("registry must not be consulted"));
		},
		times: (pkg: string) => {
			calls.push(`times:${pkg}`);
			return Effect.fail(new Error("registry must not be consulted"));
		},
		peerDependencies: () => Effect.succeed({}),
		pnpmConfig: () => Effect.succeed<string | null>(null),
	};
}

function entry(pkg: string, range: string, source?: "registry" | "workspace", catalog = "effected"): CatalogEntry {
	return {
		catalog,
		pkg,
		currentRange: range,
		operator: "^",
		rangeSpan: [0, 0] as const,
		...(source ? { source } : {}),
	};
}

describe("source routing in resolveGatedVersions", () => {
	it("resolves a workspace-sourced entry without touching the registry", async () => {
		const registry = trackingRegistry();
		const out = await Effect.runPromise(
			resolveGatedVersions(
				[entry("@fix/bumped", "^0.2.0", "workspace")],
				registry,
				ReleaseAgeGate.combine(),
				Date.now(),
				undefined,
				makeWorkspaceResolver(FIXTURE),
			),
		);
		expect(out.gated.get(versionKeyOf(entry("@fix/bumped", "^0.2.0", "workspace")))).toEqual(["0.3.0"]);
		expect(out.unresolved).toEqual([]);
		expect(registry.calls).toEqual([]);
	});

	it("does not hold a workspace entry for release age even though times are empty", async () => {
		const registry = trackingRegistry();
		const out = await Effect.runPromise(
			resolveGatedVersions(
				[entry("@fix/bumped", "^0.2.0", "workspace")],
				registry,
				ReleaseAgeGate.combine({ ageMinutes: 1440 }),
				Date.now(),
				undefined,
				makeWorkspaceResolver(FIXTURE),
			),
		);
		expect(out.gated.get(versionKeyOf(entry("@fix/bumped", "^0.2.0", "workspace")))).toEqual(["0.3.0"]);
	});

	it("routes registry-sourced entries to the registry resolver untouched", async () => {
		const out = await Effect.runPromise(
			resolveGatedVersions(
				[entry("left-pad", "^1.0.0")],
				{
					versions: () => Effect.succeed(["1.0.0", "1.1.0"]),
					times: () => Effect.succeed({}),
					peerDependencies: () => Effect.succeed({}),
					pnpmConfig: () => Effect.succeed<string | null>(null),
				},
				ReleaseAgeGate.combine(),
				Date.now(),
				undefined,
				makeWorkspaceResolver(FIXTURE),
			),
		);
		expect(out.gated.get("left-pad")).toEqual(["1.0.0", "1.1.0"]);
	});

	it("resolves each (pkg × route) pair separately when one name is workspace-sourced in one catalog and registry-sourced in another", async () => {
		// The SAME package name appears twice: workspace-sourced in catalog A,
		// registry-sourced (no `source`) in catalog B. The registry entry must get
		// the REGISTRY version list AND stay subject to the release-age gate; the
		// workspace entry must get the workspace next version, gate-exempt. Routing
		// by name alone would hand both entries the workspace list and exemption.
		const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
		const registry = {
			versions: (_pkg: string) => Effect.succeed(["0.1.0", "0.2.5"]),
			times: (_pkg: string) =>
				Effect.succeed<Record<string, string>>({ "0.1.0": iso(30 * 86_400_000), "0.2.5": iso(60_000) }),
			pnpmConfig: () => Effect.succeed<string | null>(null),
			peerDependencies: () => Effect.succeed<Record<string, string>>({}),
		};
		const workspaceEntry = entry("@fix/bumped", "^0.2.0", "workspace", "effected");
		const registryEntry = entry("@fix/bumped", "^0.1.0", undefined, "npm");
		const out = await Effect.runPromise(
			resolveGatedVersions(
				[workspaceEntry, registryEntry],
				registry,
				ReleaseAgeGate.combine({ ageMinutes: 1440 }),
				Date.now(),
				undefined,
				makeWorkspaceResolver(FIXTURE),
			),
		);
		// Workspace route: the workspace next version, exempt from the age gate.
		expect(out.gated.get(versionKeyOf(workspaceEntry))).toEqual(["0.3.0"]);
		// Registry route: the registry list, with the young 0.2.5 age-gated out.
		expect(out.gated.get(versionKeyOf(registryEntry))).toEqual(["0.1.0"]);
		expect(out.raw.get(versionKeyOf(registryEntry))).toEqual(["0.1.0", "0.2.5"]);
		expect(out.unresolved).toEqual([]);
	});

	it("reports a workspace-sourced entry naming a package outside the workspace as unresolved", async () => {
		const out = await Effect.runPromise(
			resolveGatedVersions(
				[entry("@fix/missing", "^0.1.0", "workspace")],
				trackingRegistry(),
				ReleaseAgeGate.combine(),
				Date.now(),
				undefined,
				makeWorkspaceResolver(FIXTURE),
			),
		);
		expect(out.unresolved).toEqual(["@fix/missing"]);
	});
});

describe("discover picks up the source field", () => {
	it("carries source through to the CatalogEntry", () => {
		const src = `
import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export default PnpmConfigPlugin({
	catalogs: {
		effected: {
			packages: {
				"@fix/bumped": { range: "^0.2.0", peer: "^0.2.0", strategy: "lock-minor", source: "workspace" },
				"@fix/other": { range: "^0.1.0" },
			},
		},
	},
});
`;
		const { entries } = discoverCatalogEntries(src, "config.ts");
		expect(entries.find((e) => e.pkg === "@fix/bumped")?.source).toBe("workspace");
		expect(entries.find((e) => e.pkg === "@fix/other")?.source).toBeUndefined();
	});

	it("ignores a non-catalog sibling key inside catalogs without losing the real catalogs", () => {
		// PIN: a function-valued or packages-less sibling inside `catalogs` must
		// not break the walk — the failure mode ("catalog silently not found") is
		// indistinguishable from "nothing to update".
		const src = `
import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export default PnpmConfigPlugin({
	catalogs: {
		onUpdate: () => {},
		broken: {},
		effected: { packages: { "@fix/bumped": { range: "^0.2.0", source: "workspace" } } },
	},
});
`;
		const { entries, skipped } = discoverCatalogEntries(src, "config.ts");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.pkg).toBe("@fix/bumped");
		expect(skipped).toEqual([]);
	});
});
