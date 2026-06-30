import type { StyledLine } from "./styled.js";
import { paint, tagSuffix } from "./styled.js";

/**
 * Render styled lines to a string. Each line is
 * `<gutter><space><2-space-indent><painted segments><tag>`.
 * Pure: color is decided by the caller, never read from the environment.
 *
 * @internal
 */
export function toAnsi(lines: readonly StyledLine[], opts: { color: boolean }): string {
	return lines
		.map((l) => {
			const indent = "  ".repeat(l.indent);
			const body = l.segments.map((s) => paint(s.text, s.style, opts.color)).join("");
			return `${l.gutter} ${indent}${body}${tagSuffix(l.tag)}`;
		})
		.join("\n");
}
