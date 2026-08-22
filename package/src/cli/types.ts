import type { PeerStrategy, VersionSource } from "../catalogs.js";

/** A version literal discovered in a config, with its byte-offset span. */
export interface CatalogEntry {
	readonly catalog: string;
	readonly pkg: string;
	readonly currentRange: string;
	readonly operator: "^" | "~" | "";
	/** Byte offsets [start, end) of the range string literal, including quotes. */
	readonly rangeSpan: readonly [number, number];
	/** Present when the package declares a materialized peer literal. */
	readonly peer?: { readonly value: string; readonly span: readonly [number, number] };
	readonly strategy?: PeerStrategy;
	/** Where the range resolves from; absent means the registry. */
	readonly source?: VersionSource;
}

/**
 * A version choice computed for a CatalogEntry. Tiers: `keep` (current),
 * `in-range` (latest within the caret range), `minor` (latest within the current
 * major line but beyond the caret — the meaningful intermediate for 0.x packages
 * whose caret locks the minor), and `latest` (latest overall, may cross a major).
 */
export interface Candidate {
	readonly kind: "in-range" | "minor" | "latest" | "keep";
	/** Operator-preserved range, e.g. "^5.9.3". */
	readonly range: string;
	/** Bare version, e.g. "5.9.3". */
	readonly version: string;
	/** True when this crosses the current major. */
	readonly isMajor: boolean;
	/** Recomputed peer range when the entry carries a strategy; absent otherwise. */
	readonly peerRange?: string;
}

/** A single span replacement. */
export interface Edit {
	readonly span: readonly [number, number];
	readonly text: string;
}

/** A span replacement that remembers which package and range it came from, for validation. */
export interface PlannedEdit extends Edit {
	readonly pkg: string;
	/**
	 * Route-aware key into the resolved-version maps (see `versionKeyOf`), so a
	 * workspace-sourced edit is never validated against the registry list of a
	 * same-named registry entry. Defaults to `pkg` (the registry route).
	 */
	readonly versionKey?: string;
	/** Whether this edit rewrites the package's range literal or its peer literal. */
	readonly kind: "range" | "peer";
	/** The unquoted range being written, e.g. "^5.9.3". */
	readonly value: string;
}
