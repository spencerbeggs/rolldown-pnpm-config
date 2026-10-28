import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { loadConfigAndWorkspace } from "../../src/cli/load-config.js";
import { fsWithDeniedExists } from "./utils/faulty-fs.js";
import { provideNodeFs } from "./utils/fs.js";

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });
`;

/** A temp dir holding a valid config file; the workspace file is NOT created. */
const setup = (): { configFile: string; workspacePath: string } => {
	const dir = mkdtempSync(join(tmpdir(), "rpc-load-"));
	const configFile = join(dir, "config.ts");
	writeFileSync(configFile, CONFIG, "utf8");
	return { configFile, workspacePath: join(dir, "pnpm-workspace.yaml") };
};

describe("loadConfigAndWorkspace", () => {
	it.effect("reads a missing workspace file as absent (NotFound → {})", () =>
		Effect.gen(function* () {
			const loaded = yield* loadConfigAndWorkspace(setup(), (message) => message);
			expect(loaded.parsed).toEqual({});
		}).pipe(provideNodeFs),
	);

	it.effect("fails, not 'absent', when the workspace existence check itself fails (EACCES)", () => {
		const opts = setup();
		return Effect.gen(function* () {
			const message = yield* Effect.flip(loadConfigAndWorkspace(opts, (m) => m));
			expect(message).toContain(`Cannot read or parse ${opts.workspacePath}: `);
			expect(message).toMatch(/PermissionDenied|EACCES|permission denied/i);
		}).pipe(Effect.provide(fsWithDeniedExists(opts.workspacePath)));
	});

	it.effect("fails with the existing prefix when the config file cannot be read", () =>
		Effect.gen(function* () {
			const missing = join(tmpdir(), "rpc-load-missing", "config.ts");
			const message = yield* Effect.flip(
				loadConfigAndWorkspace({ configFile: missing, workspacePath: "unused" }, (m) => m),
			);
			expect(message).toBe(`Cannot read ${missing}`);
		}).pipe(provideNodeFs),
	);

	it.effect("surfaces a parse failure of an existing workspace file with its detail", () => {
		const opts = setup();
		writeFileSync(opts.workspacePath, "packages: [unterminated\n", "utf8");
		return Effect.gen(function* () {
			const message = yield* Effect.flip(loadConfigAndWorkspace(opts, (m) => m));
			expect(message).toMatch(
				new RegExp(`^Cannot read or parse ${opts.workspacePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: .+`),
			);
		}).pipe(provideNodeFs);
	});
});
