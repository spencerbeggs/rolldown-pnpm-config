import type { Divergence } from "./types.js";

const WARNING_BOX_WIDTH = 75;

function pad(line: string): string {
	return `│${line}${" ".repeat(Math.max(0, WARNING_BOX_WIDTH - line.length - 2))}│`;
}

/**
 * Format override divergences into a prominent warning box for console output,
 * tagged with the emitting config's `name`. `Divergence.setting` is the
 * already-resolved config path, printed directly.
 *
 * @internal
 */
export function formatOverrideWarning(divergences: readonly Divergence[], name: string): string {
	if (divergences.length === 0) return "";
	const border = "─".repeat(WARNING_BOX_WIDTH - 2);
	const lines: string[] = [];
	lines.push(`┌${border}┐`);
	lines.push(pad(`  [${name}]`));
	lines.push(pad("  ⚠️  CATALOG OVERRIDE DETECTED"));
	lines.push(`├${border}┤`);
	lines.push(pad("  The following entries override managed versions:"));
	lines.push(pad(""));
	for (const d of divergences) {
		lines.push(pad(`  ${d.setting}`));
		lines.push(pad(`    Managed version: ${d.managedValue}`));
		lines.push(pad(`    Local override:  ${d.localValue}`));
		lines.push(pad(""));
	}
	lines.push(pad("  Local versions will be used. To use the managed defaults, remove"));
	lines.push(pad("  these entries from your pnpm-workspace.yaml."));
	lines.push(`└${border}┘`);
	return lines.join("\n");
}

/**
 * Format security-loosening divergences into a prominent box, tagged with the
 * emitting config's `name`.
 *
 * @internal
 */
export function formatSecurityWarning(divergences: readonly Divergence[], name: string): string {
	if (divergences.length === 0) return "";
	const border = "─".repeat(WARNING_BOX_WIDTH - 2);
	const lines: string[] = [];
	lines.push(`┌${border}┐`);
	lines.push(pad(`  [${name}]`));
	lines.push(pad("  ⚠️  SECURITY OVERRIDE DETECTED"));
	lines.push(`├${border}┤`);
	lines.push(pad("  The following entries weaken managed security defaults:"));
	lines.push(pad(""));
	for (const d of divergences) {
		lines.push(pad(`  ${d.setting}: managed=${d.managedValue} -> local=${d.localValue}`));
		lines.push(pad(`    ${d.detail}`));
		lines.push(pad(""));
	}
	lines.push(pad("  Local values will be used. Review these before shipping."));
	lines.push(`└${border}┘`);
	return lines.join("\n");
}
