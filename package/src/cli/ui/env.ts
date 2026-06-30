import { hasTTY, isAgent, isCI, isColorSupported } from "std-env";
import { link, supportsHyperlinks } from "std-osc8";

/** Detected terminal capabilities for the current process. @internal */
export interface Capabilities {
	/** ANSI color is supported and not disabled via NO_COLOR. */
	readonly color: boolean;
	/** Safe to enter a raw-mode interactive UI (real TTY, not CI/agent). */
	readonly interactive: boolean;
	/** OSC-8 hyperlinks render in this terminal. */
	readonly hyperlinks: boolean;
}

/**
 * Detect color / interactivity / hyperlink support once, at the command edge.
 * The render layer consumes the returned flags and never reads the environment.
 *
 * @internal
 */
export function detectCapabilities(): Capabilities {
	return {
		color: isColorSupported,
		interactive: hasTTY && !isCI && !isAgent,
		hyperlinks: supportsHyperlinks,
	};
}

export { link, supportsHyperlinks };
