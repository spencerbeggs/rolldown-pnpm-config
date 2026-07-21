import { Effect } from "effect";
import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { FetchPeer } from "../../src/cli/interop.js";
import { buildGroupModel } from "../../src/cli/interop-live.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import { Walk } from "../../src/cli/ui/Walk.js";
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

const ESC = "";
const DOWN = `${ESC}[B`;
const RIGHT = `${ESC}[C`;

const tick = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

describe("Walk (ink)", () => {
	it("renders every package as a row with keep preselected", () => {
		const { lastFrame } = render(createElement(Walk, { items, onDone: () => {} }));
		const frame = lastFrame() ?? "";
		expect(frame).toContain("@changesets/cli");
		expect(frame).toContain("effect");
		// keep is the filled bubble on every row before any input
		expect(frame).toContain("● ^3.0.0-next.8");
		expect(frame).toContain("○ ^3.0.0-next.9");
	});

	it("groups rows under their catalog", () => {
		const { lastFrame } = render(createElement(Walk, { items, onDone: () => {} }));
		expect(lastFrame() ?? "").toContain("catalog: silk");
	});

	it("renders a fully up-to-date catalog's rows and puts the cursor on the first actionable row", () => {
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
		const { lastFrame } = render(createElement(Walk, { items: [upA, upB, act], onDone: () => {} }));
		const frame = lastFrame() ?? "";
		// The all-up-to-date catalog is NOT hidden.
		expect(frame).toContain("catalog: effect");
		expect(frame).toContain("catalog: effect3");
		expect(frame).toContain("pkg-a");
		expect(frame).toContain("pkg-c");
		// Cursor lands on the first actionable row, not the inert up-to-date ones.
		const cursorLine = frame.split("\n").find((l) => l.includes("❯")) ?? "";
		expect(cursorLine).toContain("pkg-c");
	});

	it("shows no dry-run banner by default, and says Enter updates", () => {
		const frame = render(createElement(Walk, { items, onDone: () => {} })).lastFrame() ?? "";
		expect(frame).not.toContain("DRY RUN");
		expect(frame).toContain("Enter to update");
	});

	it("warns about a package the registry could not resolve", () => {
		// The unresolvable package has NO row of its own — it plans to keep-only and is
		// filtered out as up-to-date. The banner is the only place the author can learn
		// the name is wrong, so it must be there.
		const frame = render(createElement(Walk, { items, onDone: () => {}, unresolved: ["efect"] })).lastFrame() ?? "";
		expect(frame).toContain("Could not resolve");
		expect(frame).toContain("efect");
		expect(frame).toContain("typo");
	});

	it("shows no unresolved warning when every package resolved", () => {
		const frame = render(createElement(Walk, { items, onDone: () => {} })).lastFrame() ?? "";
		expect(frame).not.toContain("Could not resolve");
	});

	it("flags dry-run mode in the header so the user knows nothing will be written", () => {
		const frame = render(createElement(Walk, { items, onDone: () => {}, dryRun: true })).lastFrame() ?? "";
		expect(frame).toContain("DRY RUN");
		expect(frame).toContain("nothing will be written");
		// The table itself is identical — dry-run changes the banner, not the flow.
		expect(frame).toContain("● ^3.0.0-next.8");
		expect(frame).toContain("Enter to preview");
	});

	it("marks a major candidate", () => {
		const { lastFrame } = render(createElement(Walk, { items: [majorItem], onDone: () => {} }));
		expect(lastFrame() ?? "").toContain("major");
	});

	it("shows the peer that would be written for the selected bubble", () => {
		const { lastFrame } = render(createElement(Walk, { items: [peerItem], onDone: () => {} }));
		expect(lastFrame() ?? "").toContain("^3.21.0");
	});

	it("annotates a row carrying a peer warning", () => {
		const { lastFrame } = render(createElement(Walk, { items: [warnItem], onDone: () => {} }));
		expect(lastFrame() ?? "").toContain("⚠");
	});

	it("moves the cursor down and selects the highlighted candidate only on the row under the cursor", async () => {
		let decisions: readonly Decision[] = [];
		const { stdin } = render(createElement(Walk, { items, onDone: (d) => (decisions = d) }));

		stdin.write(DOWN); // cursor moves from "@changesets/cli" to "effect"
		await tick();
		stdin.write(RIGHT); // select in-range for "effect"
		await tick();
		stdin.write("\r"); // submit from wherever the cursor is
		await tick();

		expect(decisions.map((d) => d.item.entry.pkg)).toEqual(["@changesets/cli", "effect"]);
		// row "effect" moved to in-range; row "@changesets/cli" (never touched by right/left) stayed on keep
		expect(decisions.map((d) => d.chosen.kind)).toEqual(["keep", "in-range"]);
	});

	it("yields no decisions when cancelled with Esc, even after a pending selection", async () => {
		let decisions: readonly Decision[] = [];
		const { stdin } = render(createElement(Walk, { items, onDone: (d) => (decisions = d) }));

		stdin.write(RIGHT); // would select latest for "@changesets/cli"...
		await tick();
		stdin.write(ESC); // ...but Esc discards it and writes nothing
		await tick();

		expect(decisions).toEqual([]);
	});

	it("shows live interop peer floors and flags a conflicting pick, clearing it when satisfied", async () => {
		// app@1.0.0 peers on lib ^0.97.0. lib can be 0.96.0 (keep) or 0.97.0 (in-range).
		const PEERS: Record<string, Record<string, string>> = { "app@1.0.0": { lib: "^0.97.0" } };
		const fp: FetchPeer = (p, v) => Effect.succeed(PEERS[`${p}@${v}`] ?? {});
		const model = await Effect.runPromise(
			buildGroupModel(
				new Map([
					["app", ["1.0.0"]],
					["lib", ["0.96.0", "0.97.0"]],
				]),
				fp,
			),
		);
		const models = new Map([["grp", model]]);
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
		const { lastFrame, stdin } = render(
			createElement(Walk, { items: [appItem, libItem], interopModels: models, onDone: () => {} }),
		);
		let frame = lastFrame() ?? "";
		// lib's live floor is the group-derived ^0.97.0, not "—"; app conflicts.
		expect(frame).toContain("^0.97.0");
		expect(frame).toContain("⚠");
		expect(frame).toContain("lib ^0.97.0");

		// Cursor starts on the first actionable row (lib); RIGHT selects its in-range
		// 0.97.0, which satisfies app's requirement → the conflict clears live.
		stdin.write(RIGHT);
		await tick();
		frame = lastFrame() ?? "";
		expect(frame).not.toContain("⚠");
	});

	it("truncates a long peer-conflict annotation to the terminal width instead of wrapping", async () => {
		const cols = process.stdout.columns;
		Object.defineProperty(process.stdout, "columns", { value: 44, configurable: true });
		try {
			// app conflicts on several in-group libs → a long ⚠ message.
			const PEERS: Record<string, Record<string, string>> = {
				"app@1.0.0": { libA: "^9.0.0", libB: "^9.0.0", libC: "^9.0.0" },
			};
			const fp: FetchPeer = (p, v) => Effect.succeed(PEERS[`${p}@${v}`] ?? {});
			const cand = new Map<string, string[]>([
				["app", ["1.0.0"]],
				["libA", ["0.1.0"]],
				["libB", ["0.1.0"]],
				["libC", ["0.1.0"]],
			]);
			const model = await Effect.runPromise(buildGroupModel(cand, fp));
			const mk = (pkg: string, v: string): WalkItem => ({
				entry: entry(pkg, "grp"),
				candidates: [C("keep", v)],
				upToDate: true,
				driftPeer: null,
				materializePeer: null,
				peerWarning: null,
			});
			const items2 = [mk("app", "1.0.0"), mk("libA", "0.1.0"), mk("libB", "0.1.0"), mk("libC", "0.1.0")];
			const { lastFrame } = render(
				createElement(Walk, { items: items2, interopModels: new Map([["grp", model]]), onDone: () => {} }),
			);
			const frame = lastFrame() ?? "";
			expect(frame).toContain("…"); // the long conflict was clipped
			// No rendered line exceeds the (narrow) terminal width — nothing wrapped.
			for (const line of frame.split("\n")) expect(line.length).toBeLessThanOrEqual(44);
		} finally {
			Object.defineProperty(process.stdout, "columns", { value: cols, configurable: true });
		}
	});

	it("aligns the peer separator at the same column across rows with differing candidate counts", () => {
		// changesets has 2 candidates, effect has 3 (with a major on its last),
		// oneCandidateItem has 1 (already up to date) — mixed cell counts that
		// must still all land the "│" separator in the same column.
		const mixed: WalkItem[] = [changesets, effect, oneCandidateItem];
		const { lastFrame } = render(createElement(Walk, { items: mixed, onDone: () => {} }));
		const frame = lastFrame() ?? "";
		const separatorColumns = frame
			.split("\n")
			.filter((line) => line.includes("│"))
			.map((line) => line.indexOf("│"));

		expect(separatorColumns.length).toBeGreaterThan(1);
		expect(new Set(separatorColumns).size).toBe(1);
	});
});
