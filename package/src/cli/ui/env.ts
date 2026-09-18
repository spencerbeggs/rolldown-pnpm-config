import { hasTTY, isAgent, isCI, isColorSupported } from "std-env";

/** Detected terminal capabilities for the current process. @internal */
export interface Capabilities {
	/** ANSI color is supported and not disabled via NO_COLOR. */
	readonly color: boolean;
	/** Safe to enter a raw-mode interactive UI (real TTY, not CI/agent). */
	readonly interactive: boolean;
}

/**
 * Detect color / interactivity once, at the command edge.
 * The render layer consumes the returned flags and never reads the environment.
 *
 * @internal
 */
export function detectCapabilities(): Capabilities {
	return {
		color: isColorSupported,
		interactive: hasTTY && !isCI && !isAgent,
	};
}
