import type { Inline } from "@effected/cli";
import { Doc } from "@effected/cli";
import { CliUiTest } from "@effected/cli/ui/testing";
import type { Scope } from "effect";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import type { PreviewViews } from "../../src/cli/preview-views.js";
import { row, tone } from "../../src/cli/render/tone.js";
import { makePreviewScreen } from "../../src/cli/ui/preview-screen.js";

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>): Promise<A> => Effect.runPromise(Effect.scoped(effect));

const lines = (...rows: ReadonlyArray<ReadonlyArray<Inline>>) => Doc.lines(rows);
const views = (changes = lines(row(" ", 0, [tone("CHANGES_VIEW", "plain")]))): PreviewViews => ({
	changes,
	full: lines(row(" ", 0, [tone("FULL_VIEW", "plain")])),
	simulated: lines(row(" ", 0, [tone("SIMULATED_VIEW", "plain")])),
});

describe("preview screen", () => {
	it("renders the tab labels, the legend and the active (Changes) view first", async () => {
		const frame = await run(Effect.flatMap(CliUiTest.render(makePreviewScreen(views())), (h) => h.plainFrame));
		expect(frame).toContain("Changes");
		expect(frame).toContain("Full");
		expect(frame).toContain("Simulated");
		expect(frame).toContain("CHANGES_VIEW");
		expect(frame).not.toContain("FULL_VIEW");
		expect(frame).toContain("Legend:");
	});

	it("renders tags and toned rows in the active view", async () => {
		const changes = lines(
			row("+", 1, [tone("react: ^19", "added")], "local"),
			row("░", 0, [tone("packages", "unmanaged")], "unmanaged"),
		);
		const frame = await run(Effect.flatMap(CliUiTest.render(makePreviewScreen(views(changes))), (h) => h.plainFrame));
		expect(frame).toContain("react: ^19  (local)");
		expect(frame).toContain("packages  (unmanaged)");
	});

	it("switches views with Tab, and shows the Simulated legend on its tab", async () => {
		const [full, simulated] = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(makePreviewScreen(views()));
				yield* h.press("tab");
				const full = yield* h.plainFrame;
				yield* h.press("tab");
				return [full, yield* h.plainFrame] as const;
			}),
		);
		expect(full).toContain("FULL_VIEW");
		expect(simulated).toContain("SIMULATED_VIEW");
		expect(simulated).toContain("overwrite");
	});

	it("scrolls a view longer than the terminal", async () => {
		const many = lines(...Array.from({ length: 60 }, (_, i) => row(" ", 0, [tone(`line-${i}`, "plain")])));
		const [first, scrolled] = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(makePreviewScreen(views(many)), { rows: 20 });
				const first = yield* h.plainFrame;
				yield* h.press("end");
				return [first, yield* h.plainFrame] as const;
			}),
		);
		expect(first.split("\n").length).toBeLessThanOrEqual(20);
		expect(first).toContain("line-0");
		expect(first).not.toContain("line-59");
		expect(scrolled).toContain("line-59");
	});

	it("closes with q or Enter", async () => {
		for (const key of [{ char: "q" }, "enter"] as const) {
			const result = await run(
				Effect.gen(function* () {
					const h = yield* CliUiTest.render(makePreviewScreen(views()));
					yield* h.press(key);
					return yield* Effect.exit(h.result);
				}),
			);
			expect(result._tag).toBe("Success");
		}
	});

	it("ends as the host's Cancelled on Esc, which the command treats as a close", async () => {
		const exit = await run(
			Effect.gen(function* () {
				const h = yield* CliUiTest.render(makePreviewScreen(views()));
				yield* h.press("escape");
				return yield* Effect.exit(h.result);
			}),
		);
		expect(CliUiTest.cancelReason(exit)).toEqual(Option.some("escape"));
	});
});
