import type { PeerStrategy } from "../catalogs.js";

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
}

/** A version choice computed for a CatalogEntry. */
export interface Candidate {
	readonly kind: "in-range" | "latest" | "keep";
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
