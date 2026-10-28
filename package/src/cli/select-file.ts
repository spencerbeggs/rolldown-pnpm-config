import { join } from "node:path";
import { GlobPattern, GlobPatternOptions } from "@effected/glob";
import { descendSync } from "@effected/walker";
import { nodeWalkerSyncOps } from "@effected/walker/node-sync";
import { Effect, FileSystem, Result } from "effect";
import { discoverCatalogEntries } from "./discover.js";
import type { CatalogEntry } from "./types.js";

/** Top-level `.ts` FILES of a directory, no dotfiles, sorted. */
const TS_FILES = Result.getOrThrow(GlobPattern.compileResult("*.ts", GlobPatternOptions.make({ dot: false })));

/**
 * Scan a directory for top-level `.ts` files whose source contains a usable
 * `PnpmConfigPlugin(...)` catalog (discovery yields at least one entry). Read
 * or parse failures are skipped silently, and so is an unreadable directory.
 * Returns joined paths in sorted order (`@effected/walker`'s `descendSync`),
 * so a "multiple config files" report lists them the same way on every
 * filesystem.
 *
 * @internal
 */
export function findConfigFiles(dir: string): Effect.Effect<string[], never, FileSystem.FileSystem> {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const names = Result.getOrElse(descendSync(TS_FILES, { cwd: dir, ...nodeWalkerSyncOps }), () => []);
		const matches: string[] = [];
		for (const name of names) {
			if (name.endsWith(".d.ts")) continue;
			const path = join(dir, name);
			// Unreadable or unparseable — skip (discovery, not a read the user asked for).
			const usable = yield* fs.readFileString(path).pipe(
				Effect.flatMap((source) => Effect.try(() => discoverCatalogEntries(source, path).entries.length > 0)),
				Effect.orElseSucceed(() => false),
			);
			if (usable) matches.push(path);
		}
		return matches;
	});
}

/**
 * Choose the config file to operate on from a set of candidate paths. Exactly
 * one is required; zero or many is an error the caller surfaces.
 *
 * @internal
 */
export function pickConfigCandidate(
	matches: readonly string[],
): { ok: true; file: string } | { ok: false; message: string } {
	if (matches.length === 1) return { ok: true, file: matches[0] };
	if (matches.length === 0) {
		return { ok: false, message: "No config file found. Pass a file path explicitly." };
	}
	return { ok: false, message: `Multiple config files found; pass one explicitly: ${matches.join(", ")}` };
}

/**
 * Restrict entries to a single catalog by name, or return all when undefined.
 *
 * @internal
 */
export function filterEntriesByCatalog(entries: readonly CatalogEntry[], catalog: string | undefined): CatalogEntry[] {
	return catalog === undefined ? [...entries] : entries.filter((e) => e.catalog === catalog);
}
