import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
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
