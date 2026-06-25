import type { Divergence, Enforcement, StrategyResult } from "./types.js";

/**
 * Thrown when an `error`-enforced field diverges. A zero-dependency plain
 * `Error` subclass (NOT an Effect type) so it survives in the bundled pnpmfile.
 * It is intended to fail the install and must never be swallowed by an install
 * guard — see the note in `runtime/index.ts`.
 *
 * @internal
 */
export class EnforcementError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EnforcementError";
	}
}

/**
 * Apply enforcement to a strategy result, partitioning its divergences into
 * override and security buckets for the runtime to print. When enforcement is
 * `error` and there is at least one divergence, throws {@link EnforcementError}.
 *
 * @internal
 */
export function applyEnforcement(
	field: string,
	result: StrategyResult,
	enforcement: Enforcement,
): { value: unknown; overrides: Divergence[]; security: Divergence[] } {
	const overrides: Divergence[] = [];
	const security: Divergence[] = [];
	if (result.divergences.length > 0 && enforcement === "error") {
		throw new EnforcementError(
			`Field "${field}" is enforced (error) but the local config diverges: ${result.divergences
				.map((d) => d.setting)
				.join(", ")}`,
		);
	}
	if (result.divergences.length > 0 && enforcement === "warn") {
		for (const d of result.divergences) (d.kind === "security" ? security : overrides).push(d);
	}
	return { value: result.merged, overrides, security };
}
