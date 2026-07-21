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
		// Resume on both paths: a normal exit succeeds, but if Ink crashes or
		// unmounts with an error `waitUntilExit()` rejects — resume with a defect
		// so the fiber fails instead of hanging suspended forever (unhandled).
		void instance
			.waitUntilExit()
			.then(() => resume(Effect.void))
			.catch((err) => resume(Effect.die(err)));
	});
}
