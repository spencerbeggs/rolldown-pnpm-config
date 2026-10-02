import { CliUiTest } from "@effected/cli/ui/testing";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";
import { resolveProgress } from "../../src/cli/commands/upgrade.js";
import type { ProgressEvent } from "../../src/cli/ui/progress.js";
import { initialProgress, reduceProgress } from "../../src/cli/ui/progress.js";
import { progressView } from "../../src/cli/ui/progress-view.js";

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
	const collect = (calls: ReadonlyArray<readonly [number, number]>) => {
		const events: ProgressEvent[] = [];
		const report = resolveProgress((e) => Effect.sync(() => void events.push(e)));
		Effect.runSync(Effect.forEach(calls, ([done, total]) => report(done, total), { discard: true }));
		return events;
	};

	it("begins, steps, and finishes the resolve phase on the last package", () => {
		expect(
			collect([
				[0, 2],
				[1, 2],
				[2, 2],
			]).map((e) => e._tag),
		).toEqual(["Phase", "Step", "Step", "Finished"]);
		expect(
			collect([
				[0, 1],
				[1, 1],
			]).at(-1),
		).toEqual({ _tag: "Finished", label: "Resolved 1 package" });
	});

	it("finishes at once when there is nothing to resolve", () => {
		expect(collect([[0, 0]]).map((e) => e._tag)).toEqual(["Phase", "Finished"]);
	});
});

describe("progressView", () => {
	it("draws a spinner and the count while running, then commits a check-marked line", async () => {
		const [running, transcript] = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const view = yield* CliUiTest.live(progressView);
					yield* view.publish({ _tag: "Phase", label: "Resolving 2 packages", total: 2 });
					yield* view.publish({ _tag: "Step", done: 1 });
					yield* view.advance("80 millis");
					const running = yield* view.plainFrame;
					yield* view.publish({ _tag: "Step", done: 2 });
					yield* view.publish({ _tag: "Finished", label: "Resolved 2 packages" });
					yield* view.end;
					return [running, yield* view.transcript] as const;
				}),
			).pipe(Effect.provide(Layer.mergeAll(TestClock.layer()))),
		);
		expect(running).toContain("Resolving 2 packages 1/2");
		expect(transcript).toContain("✓ Resolved 2 packages");
		expect(transcript).not.toContain("2/2");
	});
});
