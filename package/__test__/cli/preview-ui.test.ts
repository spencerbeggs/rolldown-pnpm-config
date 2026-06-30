import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Preview } from "../../src/cli/ui/Preview.js";
import type { StyledLine } from "../../src/cli/ui/styled.js";

const line = (text: string): StyledLine => ({ indent: 0, gutter: " ", segments: [{ text, style: "plain" }] });

describe("Preview", () => {
	it("renders the tab labels and the active (Changes) view first", () => {
		const views = {
			changes: [line("CHANGES_VIEW")],
			full: [line("FULL_VIEW")],
			simulated: [line("SIMULATED_VIEW")],
		};
		const { lastFrame } = render(createElement(Preview, { views, onExit: () => {} }));
		const frame = lastFrame() ?? "";
		expect(frame).toContain("Changes");
		expect(frame).toContain("Full");
		expect(frame).toContain("Simulated");
		expect(frame).toContain("CHANGES_VIEW");
	});

	it("renders tag suffixes and styled segments in the active view", () => {
		const changesLines: readonly StyledLine[] = [
			{ indent: 1, gutter: "+", segments: [{ text: "react: ^19", style: "added" }], tag: "local" },
			{ indent: 0, gutter: "░", segments: [{ text: "packages", style: "unmanaged" }], tag: "unmanaged" },
		];
		const views = {
			changes: changesLines,
			full: [line("FULL_VIEW")],
			simulated: [line("SIMULATED_VIEW")],
		};
		const { lastFrame } = render(createElement(Preview, { views, onExit: () => {} }));
		const frame = lastFrame() ?? "";
		expect(frame).toContain("react: ^19");
		expect(frame).toContain("(local)");
		expect(frame).toContain("packages");
		expect(frame).toContain("(unmanaged)");
	});

	it("calls onExit when Esc is pressed", async () => {
		let exited = false;
		const views = {
			changes: [line("CHANGES_VIEW")],
			full: [line("FULL_VIEW")],
			simulated: [line("SIMULATED_VIEW")],
		};
		const { stdin } = render(
			createElement(Preview, {
				views,
				onExit: () => {
					exited = true;
				},
			}),
		);
		stdin.write("\x1b"); // Esc
		await new Promise<void>((r) => setTimeout(r, 50));
		expect(exited).toBe(true);
	});
});
