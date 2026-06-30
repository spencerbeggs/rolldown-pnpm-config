/** Kind of change at a node. @internal */
export type ChangeKind = "added" | "removed" | "changed" | "unchanged";

/** A node in the structured diff tree. @internal */
export interface DiffNode {
	readonly key: string;
	readonly path: readonly string[];
	readonly kind: ChangeKind;
	readonly tag?: "local" | "unmanaged";
	readonly before?: unknown;
	readonly after?: unknown;
	readonly children?: readonly DiffNode[];
	/** True for leaves that are array elements (rendered as `- value`). */
	readonly arrayElement?: true;
}

/** Classification metadata for the top-level keys. @internal */
export interface DiffMeta {
	readonly localKeys: ReadonlySet<string>;
	readonly managedKeys: ReadonlySet<string>;
}
