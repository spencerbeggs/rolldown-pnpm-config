import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import { Preview } from "./Preview.js";
import type { StyledLine } from "./styled.js";

/**
 * Render the interactive Preview inside an Effect, resolving once the user
 * exits and Ink has fully torn down. An Ink crash rejects `waitUntilExit()`,
 * which `Effect.promise` surfaces as a defect rather than a hung fiber.
 *
 * @internal
 */
export function runPreview(views: {
	changes: readonly StyledLine[];
	full: readonly StyledLine[];
	simulated: readonly StyledLine[];
}): Effect.Effect<void> {
	return Effect.promise(() => render(createElement(Preview, { views, onExit: () => {} })).waitUntilExit());
}
