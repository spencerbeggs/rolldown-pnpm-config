import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

/**
 * Copy the workspace fixture at `fixtureDir` to a temp directory, write
 * `source` as `config.ts` at its root, and return the config's path, so a
 * command run on it resolves workspace-sourced entries from the copy.
 * Registers cleanup via onTestFinished.
 */
export function writeTmpWorkspaceConfig(fixtureDir: string, source: string): string {
	const dir = mkdtempSync(join(tmpdir(), "rpc-ws-"));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	cpSync(fixtureDir, dir, { recursive: true });
	const file = join(dir, "config.ts");
	writeFileSync(file, source, "utf8");
	return file;
}
