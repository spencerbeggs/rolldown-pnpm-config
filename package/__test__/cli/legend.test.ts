import { describe, expect, it } from "vitest";
import { toAnsi } from "../../src/cli/ui/ansi.js";
import { legendLines, simulatedLegendLines } from "../../src/cli/ui/legend.js";

describe("legendLines", () => {
	it("labels all five diff categories", () => {
		const text = toAnsi(legendLines(), { color: false });
		for (const label of ["Legend:", "added", "removed", "modified", "unchanged", "unmanaged"]) {
			expect(text).toContain(label);
		}
	});

	it("carries the matching ChangeStyle on each swatch so it tracks the palette", () => {
		const [row] = legendLines();
		const byLabel = (needle: string) => row?.segments.find((s) => s.text.includes(needle))?.style;
		expect(byLabel("added")).toBe("added");
		expect(byLabel("removed")).toBe("removed");
		expect(byLabel("modified")).toBe("changed");
		expect(byLabel("unchanged")).toBe("unchanged");
		expect(byLabel("unmanaged")).toBe("unmanaged");
	});
});

describe("simulatedLegendLines", () => {
	it("labels the merge/overwrite + warn/error vocabulary", () => {
		const text = toAnsi(simulatedLegendLines(), { color: false });
		for (const label of ["Legend:", "merge", "overwrite", "warn", "error"]) {
			expect(text).toContain(label);
		}
	});

	it("carries the matching ChangeStyle on each swatch", () => {
		const [row] = simulatedLegendLines();
		const byLabel = (needle: string) => row?.segments.find((s) => s.text.includes(needle))?.style;
		expect(byLabel("merge")).toBe("merge");
		expect(byLabel("overwrite")).toBe("overwrite");
		expect(byLabel("warn")).toBe("changed");
		expect(byLabel("error")).toBe("warn");
	});
});
