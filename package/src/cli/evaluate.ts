import { parseSync } from "oxc-parser";
import type { Node } from "./ast.js";
import { findPluginArg, keyName } from "./ast.js";

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
				const name = keyName(prop.key as Node);
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
