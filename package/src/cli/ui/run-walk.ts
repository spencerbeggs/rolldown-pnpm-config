import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import type { Decision, WalkItem } from "../walk-types.js";
import { Walk } from "./Walk.js";

/**
 * Render the interactive Walk inside an Effect, resolving with the collected
 * decisions once the user finishes (or immediately when nothing is actionable),
 * after Ink has fully exited.
 *
 * @internal
 */
export function runWalk(items: readonly WalkItem[]): Effect.Effect<Decision[]> {
	return Effect.async<Decision[]>((resume) => {
		let collected: readonly Decision[] = [];
		const instance = render(
			createElement(Walk, {
				items,
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
