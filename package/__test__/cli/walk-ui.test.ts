import type { Screen } from "@effected/cli/ui";
import type { CliUiTestOptions } from "@effected/cli/ui/testing";
import { CliUiTest } from "@effected/cli/ui/testing";
import type { Scope } from "effect";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import type { FetchPeer } from "../../src/cli/interop.js";
import type { GroupModel } from "../../src/cli/interop-live.js";
import { buildGroupModel } from "../../src/cli/interop-live.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import type { WalkScreenProps } from "../../src/cli/ui/walk-screen.js";
import { makeWalkScreen } from "../../src/cli/ui/walk-screen.js";
import type { Decision, WalkItem } from "../../src/cli/walk-types.js";

const entry = (pkg: string, catalog = "silk"): CatalogEntry => ({
	catalog,
	pkg,
	currentRange: "^5.9.0",
	operator: "^",
	rangeSpan: [0, 8],
});
const C = (kind: Candidate["kind"], range: string): Candidate => ({
	kind,
	range,
	version: range.replace(/^[\^~]/, ""),
	isMajor: kind === "latest",
});

const changesets: WalkItem = {
	entry: entry("@changesets/cli"),
	candidates: [C("keep", "^3.0.0-next.8"), C("latest", "^3.0.0-next.9")],
	upToDate: false,
	driftPeer: null,
	materializePeer: null,
	peerWarning: null,
};
const effect: WalkItem = {
	entry: entry("effect"),
	candidates: [C("keep", "^3.21.4"), C("in-range", "^3.21.9"), C("latest", "^4.0.1")],
	upToDate: false,
	driftPeer: null,
	materializePeer: null,
	peerWarning: null,
};

const items: WalkItem[] = [changesets, effect];

const majorItem: WalkItem = {
	entry: entry("react", "react"),
	candidates: [C("keep", "^18.3.1"), C("latest", "^19.2.0")],
	upToDate: false,
	driftPeer: null,
	materializePeer: null,
	peerWarning: null,
};

const peerItem: WalkItem = {
	entry: {
		...entry("silk-effect"),
		peer: { value: "^3.21.0", span: [20, 29] },
	},
	candidates: [C("keep", "^3.21.4"), C("in-range", "^3.21.9")],
	upToDate: false,
	driftPeer: null,
	materializePeer: null,
	peerWarning: null,
};

const oneCandidateItem: WalkItem = {
	entry: entry("oxc-parser"),
	candidates: [C("keep", "0.139.0")],
	upToDate: true,
	driftPeer: null,
	materializePeer: null,
	peerWarning: null,
};

const warnItem: WalkItem = {
	entry: entry("silk-lock"),
	candidates: [C("keep", "^3.0.0"), C("in-range", "^3.1.0")],
	upToDate: false,
	driftPeer: null,
	materializePeer: null,
	peerWarning: { kind: "lock-minor-prerelease", message: "lock-minor cannot floor the prerelease" },
};

/** The walk screen with quiet defaults: no dry run, nothing unresolved, no interop. */
const walk = (items: readonly WalkItem[], extra: Partial<WalkScreenProps> = {}): Screen<Decision[]> =>
	makeWalkScreen({ items, dryRun: false, unresolved: [], interopModels: new Map(), ...extra });

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>): Promise<A> => Effect.runPromise(Effect.scoped(effect));

/** The first frame of a screen, plain (no escapes). */
const frameOf = (screen: Screen<Decision[]>, options?: CliUiTestOptions): Promise<string> =>
	run(Effect.flatMap(CliUiTest.render(screen, options), (h) => h.plainFrame));

const groupModel = (
	peers: Record<string, Record<string, string>>,
	cand: Map<string, string[]>,
): Promise<GroupModel> => {
	const fp: FetchPeer = (p, v) => Effect.succeed(peers[`${p}@${v}`] ?? {});
	return Effect.runPromise(buildGroupModel(cand, fp));
};

describe("walk screen", () => {
	it("renders every package as a row with keep preselected", async () => {
		const frame = await frameOf(walk(items));
		expect(frame).toContain("@changesets/cli");
		expect(frame).toContain("effect");
		// keep is the filled bubble on every row before any input
		expect(frame).toContain("● ^3.0.0-next.8");
		expect(frame).toContain("○ ^3.0.0-next.9");
	});

	it("groups rows under their catalog", async () => {
		expect(await frameOf(walk(items))).toContain("catalog: silk");
	});

	it("renders a fully up-to-date catalog's rows and puts the cursor on the first actionable row", async () => {
		const upA: WalkItem = {
			entry: entry("pkg-a", "effect"),
			candidates: [C("keep", "4.0.0-beta.99")],
			upToDate: true,
			driftPeer: null,
			materializePeer: null,
			peerWarning: null,
		};
		const upB: WalkItem = { ...upA, entry: entry("pkg-b", "effect") };
		const act: WalkItem = {
			entry: entry("pkg-c", "effect3"),
			candidates: [C("keep", "^0.36.0"), C("in-range", "^0.37.0")],
			upToDate: false,
			driftPeer: null,
			materializePeer: null,
			peerWarning: null,
		};
		const frame = await frameOf(walk([upA, upB, act]));
		// The all-up-to-date catalog is NOT hidden.
		expect(frame).toContain("catalog: effect");
		expect(frame).toContain("catalog: effect3");
		expect(frame).toContain("pkg-a");
		expect(frame).toContain("pkg-c");
		// Cursor lands on the first actionable row, not the inert up-to-date ones.
		const cursorLine = frame.split("\n").find((l) => l.includes("❯")) ?? "";
		expect(cursorLine).toContain("pkg-c");
	});

	it("shows no dry-run banner by default, and says Enter updates", async () => {
		const frame = await frameOf(walk(items));
		expect(frame).not.toContain("DRY RUN");
		expect(frame).toContain("Choose versions to update");
		expect(frame).toMatch(/enter update/);
	});

	it("warns about a package the registry could not resolve", async () => {
		// The unresolvable package has NO row of its own — it plans to keep-only and is
		// filtered out as up-to-date. The banner is the only place the author can learn
		// the name is wrong, so it must be there.
		const frame = await frameOf(walk(items, { unresolved: ["efect"] }));
		expect(frame).toContain("Could not resolve");
		expect(frame).toContain("efect");
		expect(frame).toContain("typo");
	});

	it("shows no unresolved warning when every package resolved", async () => {
		expect(await frameOf(walk(items))).not.toContain("Could not resolve");
	});

	it("flags dry-run mode in the header so the user knows nothing will be written", async () => {
		const frame = await frameOf(walk(items, { dryRun: true }));
		expect(frame).toContain("DRY RUN");
		expect(frame).toContain("nothing will be written");
		// The table itself is identical — dry-run changes the banner, not the flow.
		expect(frame).toContain("● ^3.0.0-next.8");
		expect(frame).toMatch(/enter preview/);
	});

	it("marks a major candidate", async () => {
		expect(await frameOf(walk([majorItem]))).toContain("major");
	});

	it("shows the peer that would be written for the selected bubble", async () => {
		expect(await frameOf(walk([peerItem]))).toContain("^3.21.0");
	});

	it("annotates a row carrying a peer warning", async () => {
		expect(await frameOf(walk([warnItem]))).toContain("⚠");
	});

	it("moves the cursor down and selects the highlighted candidate only on the row under the cursor", async () => {
		const decisions = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(walk(items));
				// cursor moves from "@changesets/cli" to "effect", selects its in-range, submits
				yield* h.press("down", "right", "enter");
				return yield* h.result;
			}),
		);
		expect(decisions.map((d) => d.item.entry.pkg)).toEqual(["@changesets/cli", "effect"]);
		// row "effect" moved to in-range; row "@changesets/cli" (never touched by right/left) stayed on keep
		expect(decisions.map((d) => d.chosen.kind)).toEqual(["keep", "in-range"]);
	});

	it("steps from current state when keys arrive in one read", async () => {
		// Ink hands a whole stdin read to the handler before React re-renders; a
		// handler reading stale render state would apply only the last key.
		const decisions = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(walk(items));
				yield* h.chunk("down", "right", "right", "enter");
				return yield* h.result;
			}),
		);
		expect(decisions.map((d) => d.chosen.kind)).toEqual(["keep", "latest"]);
	});

	it("cancels with Esc, even after a pending selection — nothing is decided", async () => {
		const exit = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(walk(items));
				yield* h.press("right", "escape"); // a pick, then Esc discards it
				return yield* Effect.exit(h.result);
			}),
		);
		expect(CliUiTest.cancelReason(exit)).toEqual(Option.some("escape"));
	});

	it("shows live interop peer floors and flags a conflicting pick, clearing it when satisfied", async () => {
		// app@1.0.0 peers on lib ^0.97.0. lib can be 0.96.0 (keep) or 0.97.0 (in-range).
		const model = await groupModel(
			{ "app@1.0.0": { lib: "^0.97.0" } },
			new Map([
				["app", ["1.0.0"]],
				["lib", ["0.96.0", "0.97.0"]],
			]),
		);
		const appItem: WalkItem = {
			entry: entry("app", "grp"),
			candidates: [C("keep", "1.0.0")],
			upToDate: true,
			driftPeer: null,
			materializePeer: null,
			peerWarning: null,
		};
		const libItem: WalkItem = {
			entry: entry("lib", "grp"),
			candidates: [C("keep", "0.96.0"), C("in-range", "0.97.0")],
			upToDate: false,
			driftPeer: null,
			materializePeer: null,
			peerWarning: null,
		};
		const [before, after] = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(walk([appItem, libItem], { interopModels: new Map([["grp", model]]) }));
				const before = yield* h.plainFrame;
				// Cursor starts on the first actionable row (lib); RIGHT selects its in-range
				// 0.97.0, which satisfies app's requirement → the conflict clears live.
				yield* h.press("right");
				return [before, yield* h.plainFrame] as const;
			}),
		);
		// lib's live floor is the group-derived ^0.97.0, not "—"; app conflicts.
		expect(before).toContain("^0.97.0");
		expect(before).toContain("⚠");
		expect(before).toContain("lib ^0.97.0");
		expect(after).not.toContain("⚠");
	});

	it("truncates a long peer-conflict annotation to the terminal width instead of wrapping", async () => {
		// app conflicts on several in-group libs → a long ⚠ message.
		const model = await groupModel(
			{ "app@1.0.0": { libA: "^9.0.0", libB: "^9.0.0", libC: "^9.0.0" } },
			new Map([
				["app", ["1.0.0"]],
				["libA", ["0.1.0"]],
				["libB", ["0.1.0"]],
				["libC", ["0.1.0"]],
			]),
		);
		const mk = (pkg: string, v: string): WalkItem => ({
			entry: entry(pkg, "grp"),
			candidates: [C("keep", v)],
			upToDate: true,
			driftPeer: null,
			materializePeer: null,
			peerWarning: null,
		});
		const items2 = [mk("app", "1.0.0"), mk("libA", "0.1.0"), mk("libB", "0.1.0"), mk("libC", "0.1.0")];
		const frame = await frameOf(walk(items2, { interopModels: new Map([["grp", model]]) }), { columns: 45 });
		expect(frame).toContain("…"); // the long conflict was clipped
		// No line exceeds the (narrow) terminal width — nothing wrapped onto a continuation line.
		for (const line of frame.split("\n")) expect(line.length).toBeLessThanOrEqual(45);
		expect(frame.split("\n").filter((l) => l.includes("│"))).toHaveLength(4);
	});

	it("scrolls a long table to fit the terminal, keeping the cursor in view", async () => {
		const many = Array.from(
			{ length: 40 },
			(_, i): WalkItem => ({
				entry: entry(`pkg-${String(i).padStart(2, "0")}`),
				candidates: [C("keep", "^1.0.0"), C("in-range", "^1.1.0")],
				upToDate: false,
				driftPeer: null,
				materializePeer: null,
				peerWarning: null,
			}),
		);
		const frame = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(walk(many), { rows: 15 });
				for (let i = 0; i < 30; i++) yield* h.press("down");
				return yield* h.plainFrame;
			}),
		);
		// Strictly shorter than the terminal: Ink clears the screen and scrollback
		// on every redraw of a frame as tall as the terminal.
		expect(frame.split("\n").length).toBeLessThan(15);
		const cursorLine = frame.split("\n").find((l) => l.includes("❯")) ?? "";
		expect(cursorLine).toContain("pkg-30");
		expect(frame).not.toContain("pkg-00");
	});

	it("aligns the peer separator at the same column across rows with differing candidate counts", async () => {
		// changesets has 2 candidates, effect has 3 (with a major on its last),
		// oneCandidateItem has 1 (already up to date) — mixed cell counts that
		// must still all land the "│" separator in the same column.
		// Wide enough that no row is cut before its separator.
		const frame = await frameOf(walk([changesets, effect, oneCandidateItem]), { columns: 140 });
		const separatorColumns = frame
			.split("\n")
			.filter((line) => line.includes("│"))
			.map((line) => line.indexOf("│"));
		expect(separatorColumns.length).toBeGreaterThan(1);
		expect(new Set(separatorColumns).size).toBe(1);
	});
});
