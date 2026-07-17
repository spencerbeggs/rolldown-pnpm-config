import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import type { Decision, WalkItem } from "../walk-types.js";
import { Walk } from "./Walk.js";

/**
 * Render the interactive table inside an Effect, resolving with the collected
 * decisions once the user submits (or with an empty list when they cancel with
 * Esc, or when no rows are actionable), after Ink has fully exited.
 *
 * @internal
 */
export function runWalk(
	items: readonly WalkItem[],
	dryRun = false,
	unresolved: readonly string[] = [],
): Effect.Effect<Decision[]> {
	return Effect.callback<Decision[]>((resume) => {
		let collected: readonly Decision[] = [];
		const instance = render(
			createElement(Walk, {
				items,
				dryRun,
				unresolved,
				onDone: (d: readonly Decision[]) => {
					collected = d;
				},
			}),
		);
		void instance.waitUntilExit().then(() => {
			resume(Effect.succeed([...collected]));
		});
	});
}
