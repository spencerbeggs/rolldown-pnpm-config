import type { Block } from "@effected/cli";
import { describe, expect, it } from "vitest";
import { legend, simulatedLegend } from "../../src/cli/render/legend.js";
import { TONES } from "../../src/cli/render/tone.js";
import { plainText } from "./utils/doc.js";

/** The token on the swatch whose text contains `needle`. */
function swatch(block: Block, needle: string) {
	if (block._tag !== "Line") throw new Error(`expected a Line, got ${block._tag}`);
	const run = block.content.find((i) => i._tag === "Text" && i.value.includes(needle));
	return run?._tag === "Text" ? run.token : undefined;
}

describe("legend", () => {
	it("labels all five diff categories", () => {
		const text = plainText(legend());
		for (const label of ["Legend:", "added", "removed", "modified", "unchanged", "unmanaged"]) {
			expect(text).toContain(label);
		}
	});

	it("tones each swatch like the diff it explains, so it tracks the palette", () => {
		expect(swatch(legend(), "added")).toBe(TONES.added);
		expect(swatch(legend(), "removed")).toBe(TONES.removed);
		expect(swatch(legend(), "modified")).toBe(TONES.changed);
		expect(swatch(legend(), "unchanged")).toBe(TONES.unchanged);
		expect(swatch(legend(), "unmanaged")).toBe(TONES.unmanaged);
	});
});

describe("simulatedLegend", () => {
	it("labels the merge/overwrite + warn/error vocabulary", () => {
		const text = plainText(simulatedLegend());
		for (const label of ["Legend:", "merge", "overwrite", "warn", "error"]) {
			expect(text).toContain(label);
		}
	});

	it("tones each swatch like the Simulated view's annotations", () => {
		expect(swatch(simulatedLegend(), "merge")).toBe(TONES.merge);
		expect(swatch(simulatedLegend(), "overwrite")).toBe(TONES.overwrite);
		expect(swatch(simulatedLegend(), "warn")).toBe(TONES.changed);
		expect(swatch(simulatedLegend(), "error")).toBe(TONES.warn);
	});
});
