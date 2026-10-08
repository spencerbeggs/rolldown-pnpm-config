import { describe, expect, it } from "@effect/vitest";
import type { Inline } from "@effected/cli";
import { Doc } from "@effected/cli";
import { CliUiTest } from "@effected/cli/ui/testing";
import { Effect, Option } from "effect";
import type { PreviewViews } from "../../src/cli/preview-views.js";
import { row, tone } from "../../src/cli/render/tone.js";
import { makePreviewScreen } from "../../src/cli/ui/preview-screen.js";

const lines = (...rows: ReadonlyArray<ReadonlyArray<Inline>>) => Doc.lines(rows);
const views = (changes = lines(row(" ", 0, [tone("CHANGES_VIEW", "plain")]))): PreviewViews => ({
	changes,
	full: lines(row(" ", 0, [tone("FULL_VIEW", "plain")])),
	simulated: lines(row(" ", 0, [tone("SIMULATED_VIEW", "plain")])),
});

describe("preview screen", () => {
	it.effect("renders the tab labels, the legend and the active (Changes) view first", () =>
		Effect.gen(function* () {
			const frame = yield* (yield* CliUiTest.render(makePreviewScreen(views()))).plainFrame;
			expect(frame).toContain("Changes");
			expect(frame).toContain("Full");
			expect(frame).toContain("Simulated");
			expect(frame).toContain("CHANGES_VIEW");
			expect(frame).not.toContain("FULL_VIEW");
			expect(frame).toContain("Legend:");
		}),
	);

	it.effect("renders tags and toned rows in the active view", () =>
		Effect.gen(function* () {
			const changes = lines(
				row("+", 1, [tone("react: ^19", "added")], "local"),
				row("░", 0, [tone("packages", "unmanaged")], "unmanaged"),
			);
			const frame = yield* (yield* CliUiTest.render(makePreviewScreen(views(changes)))).plainFrame;
			expect(frame).toContain("react: ^19  (local)");
			expect(frame).toContain("packages  (unmanaged)");
		}),
	);

	it.effect("switches views with Tab, and shows the Simulated legend on its tab", () =>
		Effect.gen(function* () {
			const h = yield* CliUiTest.render(makePreviewScreen(views()));
			yield* h.press("tab");
			const full = yield* h.plainFrame;
			yield* h.press("tab");
			const simulated = yield* h.plainFrame;
			expect(full).toContain("FULL_VIEW");
			expect(simulated).toContain("SIMULATED_VIEW");
			expect(simulated).toContain("overwrite");
		}),
	);

	it.effect("scrolls a view longer than the terminal", () =>
		Effect.gen(function* () {
			const many = lines(...Array.from({ length: 60 }, (_, i) => row(" ", 0, [tone(`line-${i}`, "plain")])));
			const h = yield* CliUiTest.render(makePreviewScreen(views(many)), { rows: 20 });
			const first = yield* h.plainFrame;
			yield* h.press("end");
			const scrolled = yield* h.plainFrame;
			expect(first.split("\n").length).toBeLessThanOrEqual(20);
			expect(first).toContain("line-0");
			expect(first).not.toContain("line-59");
			expect(scrolled).toContain("line-59");
		}),
	);

	// A row wider than the terminal must stay one viewport row: the viewport
	// counts one row per line, so a row that wraps would grow the frame past the
	// terminal's height (and Ink clears the scrollback for a frame that tall).
	it.effect("keeps a row wider than a narrow terminal on one line, cut to fit", () =>
		Effect.gen(function* () {
			const wide = lines(
				...Array.from({ length: 30 }, (_, i) => row("~", 0, [tone(`row-${i} ${"x".repeat(50)} TAIL`, "changed")])),
			);
			const h = yield* CliUiTest.render(makePreviewScreen(views(wide)), { columns: 40, rows: 20 });
			const frame = yield* h.plainFrame;
			const frameLines = frame.split("\n");
			expect(frameLines.length).toBeLessThanOrEqual(20);
			expect(frame).not.toContain("TAIL");
			expect(frameLines.some((l) => l.includes("row-0 xxx"))).toBe(true);
			expect(frameLines.every((l) => l.length <= 40)).toBe(true);
		}),
	);

	it.effect("closes with q or Enter", () =>
		Effect.forEach(
			[{ char: "q" }, "enter"] as const,
			(key) =>
				Effect.scoped(
					Effect.gen(function* () {
						const h = yield* CliUiTest.render(makePreviewScreen(views()));
						yield* h.press(key);
						const result = yield* Effect.exit(h.result);
						expect(result._tag).toBe("Success");
					}),
				),
			{ discard: true },
		),
	);

	it.effect("ends as the host's Cancelled on Esc, which the command treats as a close", () =>
		Effect.gen(function* () {
			const h = yield* CliUiTest.render(makePreviewScreen(views()));
			yield* h.press("escape");
			const exit = yield* Effect.exit(h.result);
			expect(CliUiTest.cancelReason(exit)).toEqual(Option.some("escape"));
		}),
	);
});
