import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import type { GroupModel } from "../interop-live.js";
import type { Decision, WalkItem } from "../walk-types.js";
import { Walk } from "./Walk.js";

/**
 * Render the interactive table inside an Effect, resolving with the collected
 * decisions once the user submits (or with an empty list when they cancel with
 * Esc, or when no rows are actionable), after Ink has fully exited. An Ink
 * crash rejects `waitUntilExit()`, which `Effect.promise` surfaces as a
 * defect rather than a hung fiber.
 *
 * @internal
 */
export function runWalk(
	items: readonly WalkItem[],
	dryRun = false,
	unresolved: readonly string[] = [],
	interopModels: ReadonlyMap<string, GroupModel> = new Map(),
): Effect.Effect<Decision[]> {
	return Effect.promise(async () => {
		let collected: readonly Decision[] = [];
		const instance = render(
			createElement(Walk, {
				items,
				dryRun,
				unresolved,
				interopModels,
				onDone: (d: readonly Decision[]) => {
					collected = d;
				},
			}),
		);
		await instance.waitUntilExit();
		return [...collected];
	});
}
