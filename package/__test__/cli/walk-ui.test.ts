import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import { Walk } from "../../src/cli/ui/Walk.js";
import type { Decision, WalkItem } from "../../src/cli/walk-types.js";

const entry = (pkg: string): CatalogEntry => ({
	catalog: "silk",
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
const ts: WalkItem = {
	entry: entry("typescript"),
	candidates: [C("in-range", "^5.9.3"), C("latest", "^7.1.0"), C("keep", "^5.9.0")],
	upToDate: false,
	driftPeer: null,
	materializePeer: null,
};

const tick = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

describe("Walk (ink)", () => {
	it("renders the current package and records a choice on enter", async () => {
		let decisions: readonly Decision[] = [];
		const { lastFrame, stdin } = render(createElement(Walk, { items: [ts], onDone: (d) => (decisions = d) }));

		expect(lastFrame()).toContain("typescript");
		expect(lastFrame()).toContain("^5.9.3");

		stdin.write("\r"); // enter → choose highlighted (in-range), finish
		await tick();

		expect(decisions.map((d) => d.chosen.kind)).toEqual(["in-range"]);
	});
});
