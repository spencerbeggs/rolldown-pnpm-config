/**
 * Minimal pnpm config shape — only the fields this plugin reads/writes.
 *
 * @public
 */
export interface PnpmConfig {
	/** Named catalogs injected into pnpm's workspace configuration. */
	catalogs?: Record<string, Record<string, string>>;
	[key: string]: unknown;
}

/**
 * The pnpm pnpmfile hooks object.
 *
 * @public
 */
export interface PnpmHooks {
	/** Merges the frozen, Silk-managed config into the consumer's pnpm config. */
	updateConfig(config: PnpmConfig): PnpmConfig;
}

/**
 * A single detected difference between the Silk-managed value and the
 * consumer's local value, classified as either an override or a security
 * loosening.
 *
 * @internal
 */
export interface Divergence {
	readonly setting: string;
	readonly silkValue: string;
	readonly childValue: string;
	readonly detail: string;
	readonly kind: "override" | "security";
}

/**
 * Per-install context resolved once and threaded into every strategy.
 *
 * @internal
 */
export interface RuntimeCtx {
	readonly rootName: string | undefined;
}

/**
 * The result of running a strategy: the merged value plus any divergences the
 * strategy detected along the way.
 *
 * @internal
 */
export interface StrategyResult {
	readonly merged: unknown;
	readonly divergences: readonly Divergence[];
}

/**
 * A pure merge function for one field: combine the Silk base with the local
 * value, reporting any divergences.
 *
 * @internal
 */
export type Strategy = (base: unknown, local: unknown, ctx: RuntimeCtx) => StrategyResult;

/**
 * How a field's divergences are enforced: silent, console warning, or a thrown
 * error that fails the install. Part of the public authoring API via
 * `FieldInput` and the runtime `createHooks` manifest.
 *
 * @public
 */
export type Enforcement = "absent" | "warn" | "error";

/**
 * One field's manifest entry: which strategy merges it, how it is enforced, and
 * any strategy-specific options (e.g. a refine table). Part of the public
 * `createHooks` contract.
 *
 * @public
 */
export interface ManifestEntry {
	readonly strategy: string;
	readonly enforcement: Enforcement;
	readonly options?: Record<string, unknown>;
}

/**
 * The field → strategy/enforcement manifest emitted at build time and consumed
 * by the public `createHooks`.
 *
 * @public
 */
export type Manifest = Record<string, ManifestEntry>;

/**
 * The field → frozen value base emitted at build time and consumed by the
 * public `createHooks`.
 *
 * @public
 */
export type Base = Record<string, unknown>;
