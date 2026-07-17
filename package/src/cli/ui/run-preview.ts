import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import { Preview } from "./Preview.js";
import type { StyledLine } from "./styled.js";

/**
 * Render the interactive Preview inside an Effect, resolving once the user
 * exits and Ink has fully torn down.
 *
 * @internal
 */
export function runPreview(views: {
	changes: readonly StyledLine[];
	full: readonly StyledLine[];
	simulated: readonly StyledLine[];
}): Effect.Effect<void> {
	return Effect.callback<void>((resume) => {
		const instance = render(createElement(Preview, { views, onExit: () => {} }));
		void instance.waitUntilExit().then(() => resume(Effect.void));
	});
}
