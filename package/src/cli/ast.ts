// Minimal shapes for the oxc ESTree nodes the CLI traverses. oxc nodes carry
// numeric `start`/`end` byte offsets into the source string (spans include
// quotes for string literals).

/** An oxc AST node: a `type` tag plus whatever fields that node kind carries. @internal */
export interface Node {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly [k: string]: unknown;
}

/**
 * The static name of an ObjectExpression property key: an Identifier's name
 * or a Literal's stringified value; undefined for a computed key.
 *
 * @internal
 */
export function keyName(key: Node): string | undefined {
	return key.type === "Identifier" ? (key.name as string) : key.type === "Literal" ? String(key.value) : undefined;
}

/**
 * Find a property value by key name in an ObjectExpression node. Handles both
 * Identifier keys (unquoted) and Literal keys (quoted).
 *
 * @internal
 */
export function prop(obj: Node, key: string): Node | undefined {
	for (const p of (obj.properties as Node[]) ?? []) {
		if (p.type !== "Property") continue;
		if (keyName(p.key as Node) === key) return p.value as Node;
	}
	return undefined;
}

/**
 * Find the first `PnpmConfigPlugin(...)` call's first argument (an object
 * literal). The single AST walker behind both static discovery (`upgrade`)
 * and static evaluation (`export` / `preview`), so the two always agree on
 * which call they found.
 *
 * @internal
 */
export function findPluginArg(program: unknown): Node | undefined {
	let found: Node | undefined;
	const visit = (node: unknown): void => {
		if (found || node === null || typeof node !== "object") return;
		const n = node as Node;
		if (n.type === "CallExpression") {
			const callee = n.callee as Node | undefined;
			if (callee?.type === "Identifier" && callee.name === "PnpmConfigPlugin") {
				const args = n.arguments as Node[];
				if (args?.[0]?.type === "ObjectExpression") {
					found = args[0];
					return;
				}
			}
		}
		for (const value of Object.values(n)) {
			if (Array.isArray(value)) value.forEach(visit);
			else if (value && typeof value === "object") visit(value);
		}
	};
	visit(program);
	return found;
}
