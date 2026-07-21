import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { FetchPeer } from "../../src/cli/interop.js";
import type { GroupModel } from "../../src/cli/interop-live.js";
import { buildGroupModel, computeGroupPeers } from "../../src/cli/interop-live.js";

// Stub peerDependencies: A peers on B (tighter as A rises); C peers on B looser;
// out-of-group deps are present to prove they're filtered.
const PEERS: Record<string, Record<string, string>> = {
	"A@1.0.0": { B: "^0.96.0", lodash: "^4" },
	"A@1.1.0": { B: "^0.97.0" },
	"B@0.96.0": {},
	"B@0.97.0": {},
	"C@2.0.0": { B: "^0.95.0" },
};
const fetchPeer: FetchPeer = (pkg, v) => Effect.succeed(PEERS[`${pkg}@${v}`] ?? {});

const candidates = new Map<string, string[]>([
	["A", ["1.0.0", "1.1.0"]],
	["B", ["0.96.0", "0.97.0"]],
	["C", ["2.0.0"]],
]);

const model = (): Promise<GroupModel> => Effect.runPromise(buildGroupModel(candidates, fetchPeer));
const sel = (o: Record<string, string>) => new Map(Object.entries(o));

describe("computeGroupPeers", () => {
	it("drops out-of-group peer deps from the model", async () => {
		const m = await model();
		expect(m.peerReqs.get("A@1.0.0")).toEqual([{ dep: "B", range: "^0.96.0" }]); // no lodash
	});

	it("derives a member's floor from the lowest in-group declaration, else ^selected", async () => {
		const m = await model();
		// A and C both peer on B; the lowest floor wins (^0.95.0 from C).
		const { peer } = computeGroupPeers(m, sel({ A: "1.0.0", B: "0.96.0", C: "2.0.0" }));
		expect(peer.get("B")).toBe("^0.95.0");
		// A and C are peered on by no one → ^selected.
		expect(peer.get("A")).toBe("^1.0.0");
		expect(peer.get("C")).toBe("^2.0.0");
	});

	it("recomputes the floor live when a selection changes", async () => {
		const m = await model();
		// Without C in the picture, B's floor follows A's requirement.
		const two = new Map([
			["A", "1.0.0"],
			["B", "0.96.0"],
		]);
		expect(computeGroupPeers(m, two).peer.get("B")).toBe("^0.96.0");
		two.set("A", "1.1.0");
		expect(computeGroupPeers(m, two).peer.get("B")).toBe("^0.97.0");
	});

	it("flags a conflict when a pick violates an in-group peer, and clears it when satisfied", async () => {
		const m = await model();
		// A@1.1.0 needs B ^0.97.0 but B is at 0.96.0 → conflict on A.
		const bad = computeGroupPeers(m, sel({ A: "1.1.0", B: "0.96.0" }));
		expect(bad.conflict.get("A")).toContain("B ^0.97.0");
		// Raise B to 0.97.0 → satisfied, no conflict.
		const good = computeGroupPeers(m, sel({ A: "1.1.0", B: "0.97.0" }));
		expect(good.conflict.has("A")).toBe(false);
	});
});
