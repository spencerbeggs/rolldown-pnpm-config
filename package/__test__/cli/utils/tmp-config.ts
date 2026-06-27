import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

/** Write `source` to a temp `.ts` file and return its path. Registers cleanup via onTestFinished. */
export function writeTmpConfig(source: string): string {
	const dir = mkdtempSync(join(tmpdir(), "rpc-cli-"));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const file = join(dir, "config.ts");
	writeFileSync(file, source, "utf8");
	return file;
}
