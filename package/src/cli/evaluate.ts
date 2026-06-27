import { parseSync } from "oxc-parser";

interface Node {
	readonly type: string;
	readonly [k: string]: unknown;
}

/** Find the first `PnpmConfigPlugin(...)` call's first argument (an object literal). */
function findPluginArg(program: unknown): Node | undefined {
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

/** Evaluate a literal AST node into a plain JS value; unsupported nodes push to `errors`. */
function evalNode(node: Node, path: string, errors: string[]): unknown {
	switch (node.type) {
		case "Literal":
			return node.value;
		case "ArrayExpression": {
			const out: unknown[] = [];
			for (const [i, el] of ((node.elements as Node[]) ?? []).entries()) {
				if (el === null) {
					errors.push(`${path}[${i}]: holes are not supported`);
					continue;
				}
				const val = evalNode(el, `${path}[${i}]`, errors);
				if (val !== undefined) out.push(val);
			}
			return out;
		}
		case "ObjectExpression": {
			const out: Record<string, unknown> = {};
			for (const prop of (node.properties as Node[]) ?? []) {
				if (prop.type !== "Property") {
					errors.push(`${path}: spread/getter is not supported`);
					continue;
				}
				const key = prop.key as Node;
				const name =
					key.type === "Identifier" ? (key.name as string) : key.type === "Literal" ? String(key.value) : undefined;
				if (name === undefined) {
					errors.push(`${path}: computed key is not supported`);
					continue;
				}
				const value = evalNode(prop.value as Node, `${path}.${name}`, errors);
				if (value !== undefined) out[name] = value;
			}
			return out;
		}
		default:
			errors.push(`${path}: ${node.type} is not a literal; inline a concrete value`);
			return undefined;
	}
}

/**
 * Statically evaluate the single `PnpmConfigPlugin(...)` call's object-literal
 * argument into a plain config object. No module execution. Non-literal values
 * are reported in `errors` and omitted; `config` is null when no call is found.
 *
 * @internal
 */
export function evaluatePluginConfig(
	source: string,
	filename: string,
): { config: Record<string, unknown> | null; errors: string[] } {
	const errors: string[] = [];
	const result = parseSync(filename, source);
	if (result.errors.length > 0) {
		return { config: null, errors: result.errors.map((e) => e.message) };
	}
	const arg = findPluginArg(result.program);
	if (!arg) return { config: null, errors };
	const config = evalNode(arg, "config", errors) as Record<string, unknown>;
	return { config, errors };
}
