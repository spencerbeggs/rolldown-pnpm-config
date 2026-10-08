import { describe, expect, it } from "@effect/vitest";
import { CliUiTest } from "@effected/cli/ui/testing";
import { Effect } from "effect";
import { resolveProgress } from "../../src/cli/commands/upgrade.js";
import type { ProgressEvent } from "../../src/cli/ui/progress.js";
import { initialProgress, reduceProgress } from "../../src/cli/ui/progress.js";
import { progressOptions } from "../../src/cli/ui/screens.js";

describe("reduceProgress", () => {
	it("begins a phase, steps it, and finishes with the committed label", () => {
		const events: ProgressEvent[] = [
			{ _tag: "Phase", label: "Resolving 3 packages", total: 3 },
			{ _tag: "Step", done: 2 },
			{ _tag: "Finished", label: "Resolved 3 packages" },
		];
		expect(events.reduce(reduceProgress, initialProgress)).toEqual({
			label: "Resolved 3 packages",
			done: 2,
			total: 3,
			finished: true,
		});
	});
});

describe("resolveProgress", () => {
	const collect = (calls: ReadonlyArray<readonly [number, number]>) =>
		Effect.gen(function* () {
			const events: ProgressEvent[] = [];
			const report = resolveProgress((e) => Effect.sync(() => void events.push(e)));
			yield* Effect.forEach(calls, ([done, total]) => report(done, total), { discard: true });
			return events;
		});

	it.effect("begins, steps, and finishes the resolve phase on the last package", () =>
		Effect.gen(function* () {
			const two = yield* collect([
				[0, 2],
				[1, 2],
				[2, 2],
			]);
			expect(two.map((e) => e._tag)).toEqual(["Phase", "Step", "Step", "Finished"]);
			const one = yield* collect([
				[0, 1],
				[1, 1],
			]);
			expect(one.at(-1)).toEqual({ _tag: "Finished", label: "Resolved 1 package" });
		}),
	);

	it.effect("finishes at once when there is nothing to resolve", () =>
		Effect.gen(function* () {
			expect((yield* collect([[0, 0]])).map((e) => e._tag)).toEqual(["Phase", "Finished"]);
		}),
	);
});

describe("progressOptions", () => {
	it.effect("draws a spinner and the count while running, then commits a check-marked line", () =>
		Effect.gen(function* () {
			const view = yield* CliUiTest.live(progressOptions);
			yield* view.publish({ _tag: "Phase", label: "Resolving 2 packages", total: 2 });
			yield* view.publish({ _tag: "Step", done: 1 });
			yield* view.advance("80 millis");
			const running = yield* view.plainFrame;
			yield* view.publish({ _tag: "Step", done: 2 });
			yield* view.publish({ _tag: "Finished", label: "Resolved 2 packages" });
			yield* view.end;
			const transcript = yield* view.transcript;
			expect(running).toContain("Resolving 2 packages 1/2");
			expect(transcript).toContain("✓ Resolved 2 packages");
			expect(transcript).not.toContain("2/2");
		}),
	);

	// A pipe, CI or an agent: the run's `final` is the empty document, so the
	// progress leaves nothing on stdout beside the command's own output.
	it.effect("prints nothing when the run is not interactive", () =>
		Effect.gen(function* () {
			const view = yield* CliUiTest.live({ ...progressOptions, interactive: false });
			yield* view.publish({ _tag: "Phase", label: "Resolving 2 packages", total: 2 });
			yield* view.publish({ _tag: "Finished", label: "Resolved 2 packages" });
			yield* view.end;
			expect((yield* view.transcript).trim()).toBe("");
		}),
	);

	it.effect("control: without `final`, a non-interactive run prints the committed frame", () =>
		Effect.gen(function* () {
			const { final: _final, ...withoutFinal } = progressOptions;
			const view = yield* CliUiTest.live({ ...withoutFinal, interactive: false });
			yield* view.publish({ _tag: "Phase", label: "Resolving 2 packages", total: 2 });
			yield* view.publish({ _tag: "Finished", label: "Resolved 2 packages" });
			yield* view.end;
			expect(yield* view.transcript).toContain("Resolved 2 packages");
		}),
	);
});
