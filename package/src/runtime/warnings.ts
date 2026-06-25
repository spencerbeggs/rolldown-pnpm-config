import type { Divergence } from "./types.js";

/** Width of the warning box in characters. */
const WARNING_BOX_WIDTH = 75;

/**
 * Format override divergences into a prominent warning box for console output.
 * Ports Silk `warnings.ts` `formatOverrideWarning`; `Divergence.setting` is the
 * already-resolved config path, printed directly.
 *
 * @internal
 */
export function formatOverrideWarning(divergences: readonly Divergence[]): string {
	if (divergences.length === 0) {
		return "";
	}

	const lines: string[] = [];
	const border = "─".repeat(WARNING_BOX_WIDTH - 2);

	lines.push(`┌${border}┐`);
	lines.push(`│  ⚠️  SILK CATALOG OVERRIDE DETECTED${" ".repeat(WARNING_BOX_WIDTH - 39)}│`);
	lines.push(`├${border}┤`);
	lines.push(`│  The following entries override Silk-managed versions:${" ".repeat(WARNING_BOX_WIDTH - 58)}│`);
	lines.push(`│${" ".repeat(WARNING_BOX_WIDTH - 2)}│`);

	for (const divergence of divergences) {
		const catalogPath = divergence.setting;
		const silkLine = `    Silk version:   ${divergence.silkValue}`;
		const localLine = `    Local override: ${divergence.childValue}`;

		lines.push(`│  ${catalogPath}${" ".repeat(Math.max(0, WARNING_BOX_WIDTH - catalogPath.length - 4))}│`);
		lines.push(`│${silkLine}${" ".repeat(Math.max(0, WARNING_BOX_WIDTH - silkLine.length - 2))}│`);
		lines.push(`│${localLine}${" ".repeat(Math.max(0, WARNING_BOX_WIDTH - localLine.length - 2))}│`);
		lines.push(`│${" ".repeat(WARNING_BOX_WIDTH - 2)}│`);
	}

	lines.push(
		`│  Local versions will be used. To use Silk defaults, remove these${" ".repeat(WARNING_BOX_WIDTH - 69)}│`,
	);
	lines.push(`│  entries from your pnpm-workspace.yaml.${" ".repeat(WARNING_BOX_WIDTH - 44)}│`);
	lines.push(`└${border}┘`);

	return lines.join("\n");
}

/**
 * Format security-loosening divergences into a prominent box for console
 * output. Ports Silk `warnings.ts` `formatSecurityWarning`.
 *
 * @internal
 */
export function formatSecurityWarning(divergences: readonly Divergence[]): string {
	if (divergences.length === 0) {
		return "";
	}

	const lines: string[] = [];
	const border = "─".repeat(WARNING_BOX_WIDTH - 2);

	lines.push(`┌${border}┐`);
	lines.push(`│  ⚠️  SILK SECURITY OVERRIDE DETECTED${" ".repeat(WARNING_BOX_WIDTH - 40)}│`);
	lines.push(`├${border}┤`);
	lines.push(`│  The following entries weaken Silk-managed security defaults:${" ".repeat(WARNING_BOX_WIDTH - 64)}│`);
	lines.push(`│${" ".repeat(WARNING_BOX_WIDTH - 2)}│`);

	for (const divergence of divergences) {
		const settingLine = `  ${divergence.setting}: Silk=${divergence.silkValue} -> local=${divergence.childValue}`;
		const detailLine = `    ${divergence.detail}`;
		lines.push(`│${settingLine}${" ".repeat(Math.max(0, WARNING_BOX_WIDTH - settingLine.length - 2))}│`);
		lines.push(`│${detailLine}${" ".repeat(Math.max(0, WARNING_BOX_WIDTH - detailLine.length - 2))}│`);
		lines.push(`│${" ".repeat(WARNING_BOX_WIDTH - 2)}│`);
	}

	lines.push(`│  Local values will be used. Review these before shipping.${" ".repeat(WARNING_BOX_WIDTH - 60)}│`);
	lines.push(`└${border}┘`);

	return lines.join("\n");
}
