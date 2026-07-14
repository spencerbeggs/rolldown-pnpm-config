import { readFileSync } from "node:fs";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { runUpgrade, runUpgradePreview } from "../../src/cli/commands/upgrade.js";
import { makeStubResolver } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

/** The rendered failure of a failed Exit, for asserting WHY --yes refused. */
const failureText = (exit: Exit.Exit<unknown, unknown>): string =>
	Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
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

const resolver = makeStubResolver({
	versions: {
		typescript: ["5.9.0", "5.9.3", "6.0.0"],
		vitest: ["4.0.0", "4.2.3", "5.0.0"],
	},
});

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

describe("runUpgrade (release-age gate)", () => {
	const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 minimumReleaseAge: 1440,
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
});
`;
	const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

	it("never proposes a version younger than minimumReleaseAge", async () => {
		const file = writeTmpConfig(CONFIG);
		const resolver = makeStubResolver({
			versions: { typescript: ["5.9.0", "5.9.3"] },
			// 5.9.3 published 1 minute ago → blocked by the 1440-minute gate; 5.9.0 is old
			times: { typescript: { "5.9.0": iso(30 * 86_400_000), "5.9.3": iso(60_000) } },
		});
		const out = await Effect.runPromise(runUpgrade({ file, resolver }));
		const result = readFileSync(file, "utf8");
		expect(result).toContain('typescript: "^5.9.0"'); // unchanged — 5.9.3 is too young
		expect(out.updated).toBe(0);
	});
});

describe("runUpgrade (interop)", () => {
	const SRC = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { effect: { packages: {
 effect: { range: "^3.16.0", strategy: "interop" },
 "@effect/cli": { range: "^0.70.0", strategy: "interop" },
} } } });
`;
	it("downgrades a dependent and materializes caret peers", async () => {
		const file = writeTmpConfig(SRC);
		const resolver = makeStubResolver({
			versions: { effect: ["3.16.0", "3.17.0"], "@effect/cli": ["0.70.0", "0.71.0"] },
			peerDependencies: {
				effect: { "3.16.0": {}, "3.17.0": {} },
				"@effect/cli": { "0.70.0": { effect: "^3.16.0" }, "0.71.0": { effect: "^3.18.0" } },
			},
		});
		const out = await Effect.runPromise(runUpgrade({ file, resolver }));
		const result = readFileSync(file, "utf8");
		expect(result).toContain('effect: { range: "^3.17.0"'); // effect bumped in-range
		expect(result).toContain('"@effect/cli": { range: "^0.70.0"'); // cli held — 0.71 needs effect ^3.18
		expect(result).toContain('peer: "^3.16.0"'); // effect peer floor from cli@0.70
		expect(out.conflicts).toEqual([]);
	});
});

describe("runUpgrade (--yes strictness)", () => {
	// An EXACT-pinned lock-minor entry: the strategy floors the patch to .0, so the
	// peer derives to the exact range "3.4.0" — a version that was never published
	// (only 3.4.1 exists). Nothing about the entry warns; only validation against
	// the published list catches it.
	const UNSATISFIABLE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: {
  "left-pad": { range: "3.4.1", peer: "3.4.1", strategy: "lock-minor" },
 } } },
});
`;

	it("writes nothing and fails when a derived range is unsatisfiable", async () => {
		const file = writeTmpConfig(UNSATISFIABLE);
		const resolver = makeStubResolver({ versions: { "left-pad": ["3.4.1"] } });
		const before = readFileSync(file, "utf8");

		const exit = await Effect.runPromiseExit(runUpgrade({ file, resolver }));

		expect(Exit.isFailure(exit), "an unsatisfiable derived peer must abort the run").toBe(true);
		expect(failureText(exit)).toContain("no published version of left-pad satisfies 3.4.0");
		// Nothing at all was written — not even the entries that WOULD have been fine.
		expect(readFileSync(file, "utf8")).toBe(before);
	});

	// The user's real case, with lock-minor instead of lock: flooring a prerelease is
	// meaningless, so the derivation warns. Unattended, a warning must be fatal.
	const PRERELEASE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: {
  "@changesets/cli": { range: "^3.0.0-next.8", peer: "^3.0.0-next.8", strategy: "lock-minor" },
 } } },
});
`;

	it("fails on a lock-minor prerelease warning and writes nothing", async () => {
		const file = writeTmpConfig(PRERELEASE);
		const resolver = makeStubResolver({ versions: { "@changesets/cli": ["2.29.0", "3.0.0-next.8"] } });
		const before = readFileSync(file, "utf8");

		const exit = await Effect.runPromiseExit(runUpgrade({ file, resolver }));

		expect(Exit.isFailure(exit), "a peer-strategy warning must abort an unattended run").toBe(true);
		expect(failureText(exit)).toContain("incompatible peer strategy");
		expect(failureText(exit)).toContain("@changesets/cli: lock-minor cannot floor the prerelease");
		expect(readFileSync(file, "utf8")).toBe(before);
	});

	it("fails on a peer warning even when the entry also has a range bump to apply", async () => {
		// The warning must be collected on the RANGE-CHANGE path too, not only on the
		// peer-only paths: next.9 is a same-track in-range bump, so this entry never
		// reaches the peer-only branches.
		const file = writeTmpConfig(PRERELEASE);
		const resolver = makeStubResolver({ versions: { "@changesets/cli": ["3.0.0-next.8", "3.0.0-next.9"] } });
		const before = readFileSync(file, "utf8");

		const exit = await Effect.runPromiseExit(runUpgrade({ file, resolver }));

		expect(Exit.isFailure(exit)).toBe(true);
		expect(failureText(exit)).toContain("incompatible peer strategy");
		expect(readFileSync(file, "utf8"), "a warned entry must not have its range bumped either").toBe(before);
	});

	it("still fails hard on the fixture the interactive path drops-and-reports (asymmetry pin)", async () => {
		// Same shape as the interactive atomic-rejection fixture: a good simple
		// package (typescript) alongside left-pad, whose lock-minor peer floor is
		// unsatisfiable. Interactively this drops ONLY left-pad and keeps
		// typescript's bump (see upgrade-interactive.int.test.ts); --yes is strict
		// instead and must abort the ENTIRE run, writing nothing at all — not even
		// typescript's otherwise-good edit.
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: {
  typescript: "^5.9.0",
  "left-pad": { range: "3.4.1", peer: "3.4.1", strategy: "lock-minor" },
 } } },
});
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({
			versions: { typescript: ["5.9.0", "5.9.3"], "left-pad": ["3.4.1", "3.4.2"] },
		});
		const before = readFileSync(file, "utf8");

		const exit = await Effect.runPromiseExit(runUpgrade({ file, resolver }));

		expect(Exit.isFailure(exit), "--yes must abort the whole run, not drop-and-report").toBe(true);
		expect(failureText(exit)).toContain("no published version of left-pad satisfies 3.4.0");
		expect(readFileSync(file, "utf8"), "typescript's otherwise-good edit must NOT be written either").toBe(before);
	});

	it("never applies a major bump", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: { "left-pad": "^1.2.0" } } },
});
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({ versions: { "left-pad": ["1.2.0", "1.2.9", "2.0.0"] } });

		const out = await Effect.runPromise(runUpgrade({ file, resolver }));

		const result = readFileSync(file, "utf8");
		expect(result).toContain('"^1.2.9"'); // latest in-range
		expect(result).not.toContain("^2."); // never the major
		expect(out.rejected).toEqual([]);
	});

	it("validates against the UNGATED list so the release-age gate cannot reject a good range", async () => {
		// 2.0.0 is published but younger than the gate, so it is absent from the
		// candidate list. The entry's drifted peer resyncs to ^2.0.0 — satisfiable
		// against the REAL registry, unsatisfiable against the gated view. Validating
		// against the gated list would spuriously abort this run.
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 minimumReleaseAge: 1440,
 catalogs: { silk: { packages: {
  "left-pad": { range: "^2.0.0", peer: "^2.1.0", strategy: "lock-minor" },
 } } },
});
`;
		const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({
			versions: { "left-pad": ["1.0.0", "2.0.0"] },
			times: { "left-pad": { "1.0.0": iso(30 * 86_400_000), "2.0.0": iso(60_000) } },
		});

		const exit = await Effect.runPromiseExit(runUpgrade({ file, resolver }));

		expect(Exit.isSuccess(exit), `validation must run against the ungated list: ${failureText(exit)}`).toBe(true);
		expect(readFileSync(file, "utf8")).toContain('peer: "^2.0.0"'); // drifted peer resynced
	});
});

describe("the reported prerelease-peer bug (@changesets/cli lock)", () => {
	// The exact config the user reported. Before this branch, derivePeerRange rebuilt
	// the version from major.minor.patch, dropping "-next.8", so the derived peer
	// ^3.0.0 never equalled the actual ^3.0.0-next.8 — drift was reported forever and
	// the keep path rewrote the peer to ^3.0.0, a range that matches NO published
	// version of the package.
	const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { default: { packages: {
  "@changesets/cli": { range: "^3.0.0-next.8", peer: "^3.0.0-next.8", strategy: "lock" },
 } } },
});
`;
	const resolver = makeStubResolver({ versions: { "@changesets/cli": ["2.29.0", "3.0.0-next.8"] } });

	it("proposes NO peer resync in the preview", async () => {
		const file = writeTmpConfig(SOURCE);
		const out = await Effect.runPromiseExit(runUpgradePreview({ file, resolver, full: true }));
		expect(Exit.isSuccess(out)).toBe(true);
		const text = Exit.isSuccess(out) ? out.value : "";
		expect(text).toContain("@changesets/cli");
		// The peer column still shows the prerelease it is pinned to, and the tally
		// counts ZERO resyncs — before this branch the entry proposed peer ^3.0.0.
		expect(text).toContain("^3.0.0-next.8");
		expect(text).toContain("0 resync");
		expect(text).toContain("1 up to date");
		expect(text.replace(/\^3\.0\.0-next\.8/g, ""), "the bogus ^3.0.0 resync target must not appear").not.toContain(
			"3.0.0",
		);
	});

	it("leaves the file byte-identical under --yes", async () => {
		const file = writeTmpConfig(SOURCE);
		const before = readFileSync(file, "utf8");
		const out = await Effect.runPromise(runUpgrade({ file, resolver }));
		expect(readFileSync(file, "utf8"), "a keep must not rewrite the prerelease peer").toBe(before);
		expect(out.updated).toBe(0);
		expect(out.rejected).toEqual([]);
	});
});

describe("runUpgradePreview", () => {
	it("projects in-range bumps without writing", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({ versions: { typescript: ["5.9.0", "5.9.3"] } });
		const before = readFileSync(file, "utf8");
		const out = await Effect.runPromise(runUpgradePreview({ file, resolver, full: false }));
		expect(out).toContain("typescript");
		expect(out).toContain("● ^5.9.3"); // in-range bump chosen, its bubble filled
		expect(readFileSync(file, "utf8")).toBe(before);
	});
});

// A package name the registry cannot resolve is almost always a typo. It used to
// plan to keep-only, count as "up to date", and be hidden from the table — the
// author never learned the name was wrong. It must now be surfaced everywhere.
describe("unresolvable package (typo in the config)", () => {
	const TYPO_SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: {
  typescript: "^5.9.0",
  efect: "^3.0.0",
 } } },
});
`;
	// `efect` is a typo: the registry 404s it. `typescript` resolves normally.
	const typoResolver = makeStubResolver({
		versions: { typescript: ["5.9.0", "5.9.3"] },
		failVersions: ["efect"],
	});

	it("--yes FAILS and writes nothing rather than silently skipping the typo", async () => {
		const file = writeTmpConfig(TYPO_SOURCE);
		const before = readFileSync(file, "utf8");

		const exit = await Effect.runPromiseExit(runUpgrade({ file, resolver: typoResolver }));

		expect(Exit.isFailure(exit)).toBe(true);
		expect(failureText(exit)).toContain("efect");
		expect(failureText(exit)).toContain("Could not resolve");
		// Nothing is written — not even typescript's perfectly good bump. Under --yes a
		// config with a bad name is a broken config; applying half of it is worse.
		expect(readFileSync(file, "utf8")).toBe(before);
	});

	it("--preview reports the unresolvable package instead of omitting it", async () => {
		const file = writeTmpConfig(TYPO_SOURCE);
		const out = await Effect.runPromise(runUpgradePreview({ file, resolver: typoResolver, full: false }));
		expect(out).toContain("efect");
		expect(out).toContain("Could not resolve");
	});

	it("--yes --dry-run computes the real edits but writes NOTHING", async () => {
		// The flags COMPOSE. `--yes` used to return before the dry-run gate was ever
		// reached, so `--yes --dry-run` WROTE the file — the precise opposite of what
		// someone adding --dry-run to a CI invocation is asking for.
		const file = writeTmpConfig(TYPO_SOURCE);
		const allResolve = makeStubResolver({
			versions: { typescript: ["5.9.0", "5.9.3"], efect: ["3.0.0", "3.1.0"] },
		});
		const before = readFileSync(file, "utf8");

		const out = await Effect.runPromise(runUpgrade({ file, resolver: allResolve, dryRun: true }));

		// It did the real work — the count is what an apply WOULD have written...
		expect(out.updated).toBe(2);
		// ...and the file is untouched.
		expect(readFileSync(file, "utf8")).toBe(before);
	});

	it("--yes succeeds normally when every package resolves", async () => {
		const file = writeTmpConfig(TYPO_SOURCE);
		const allResolve = makeStubResolver({
			versions: { typescript: ["5.9.0", "5.9.3"], efect: ["3.0.0", "3.1.0"] },
		});
		const out = await Effect.runPromise(runUpgrade({ file, resolver: allResolve }));
		expect(out.updated).toBe(2);
		expect(readFileSync(file, "utf8")).toContain('typescript: "^5.9.3"');
	});
});
