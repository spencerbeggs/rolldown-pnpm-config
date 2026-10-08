import { readFileSync } from "node:fs";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { CliEnv, CliExit, CliLinks } from "@effected/cli";
import type { CliUiTestSession } from "@effected/cli/ui/testing";
import { CliUiTest } from "@effected/cli/ui/testing";
import { Effect, Exit, Fiber, Layer, Option } from "effect";
import { Command } from "effect/cli";
import { upgradeCommand } from "../../src/cli/commands/upgrade.js";
import { WorkingDirectory } from "../../src/cli/cwd.js";
import { stubResolverLayer } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
});
`;

const resolver = stubResolverLayer({ versions: { typescript: ["5.9.0", "5.9.3", "6.0.0"] } });

// A person at a 100-column terminal. The session's own layer goes INSIDE the
// presentation layers, so its theme, streams and interactivity win; the
// terminal facts `Doc.print` reads (width, audience, links) come from outside.
const presentation = Layer.mergeAll(
	CliEnv.layerTest({ tty: true, columns: 100, audience: "human" }),
	CliLinks.layerTest("off"),
);

/** `rolldown-pnpm-config upgrade <file> [...flags]` under a session, forked so the test drives its screens. */
const upgrade = (session: CliUiTestSession, args: ReadonlyArray<string>) =>
	Command.runWith(upgradeCommand, { version: "0.0.0" })(args).pipe(
		Effect.provide(session.layer),
		Effect.provide(presentation),
		Effect.provide(resolver),
		Effect.provide(CliExit.layer),
		Effect.provideService(WorkingDirectory, "/"),
		Effect.provide(NodeServices.layer),
		Effect.forkScoped,
	);

describe("upgrade, interactive, end to end", () => {
	it.effect(
		"resolves with a live progress line, takes the picks from the table, then prints the summary and writes",
		() =>
			Effect.gen(function* () {
				const file = writeTmpConfig(SOURCE);
				const session = yield* CliUiTest.session({ color: "none", columns: 100 });
				const program = yield* upgrade(session, [file]);

				// Mount 1 is the resolve phase's live view, mount 2 the table.
				yield* session.next({ contains: "Resolved 1 package" });
				const table = yield* session.next({ contains: "Choose versions to update" });
				expect(yield* table.plainFrame).toContain("typescript");
				// The cursor starts on the actionable row; → picks the in-range ^5.9.3.
				yield* table.press("right", "enter");
				expect(Exit.isSuccess(yield* Fiber.await(program))).toBe(true);

				// The progress phase committed its check-marked line above the table.
				const transcript = yield* session.transcript;
				expect(transcript).toContain("✓ Resolved 1 package");
				// The summary is on stdout, after the screen unmounted, with the outcome line.
				const stdout = yield* session.stdout;
				expect(stdout).toMatch(/~ typescript\s+○ \^5\.9\.0\s+● \^5\.9\.3/);
				expect(stdout).toContain("1 to update");
				expect(stdout).toContain("Applied 1 change(s).");
				expect(readFileSync(file, "utf8")).toContain('typescript: "^5.9.3"');
				expect(yield* session.mounts).toBe(2);
			}),
	);

	it.effect("--dry-run runs the same flow and writes nothing", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(SOURCE);
			const session = yield* CliUiTest.session({ color: "none", columns: 100 });
			const program = yield* upgrade(session, ["--dry-run", file]);
			yield* session.next({ contains: "Resolved 1 package" });
			const table = yield* session.next({ contains: "DRY RUN" });
			yield* table.press("right", "enter");
			expect(Exit.isSuccess(yield* Fiber.await(program))).toBe(true);
			expect(yield* session.stdout).toContain("Dry run — no changes written. 1 change(s) would be applied.");
			expect(readFileSync(file, "utf8")).toBe(SOURCE);
		}),
	);

	it.effect("Esc on the table is a close: says nothing was written and exits 0", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(SOURCE);
			const session = yield* CliUiTest.session({ color: "none", columns: 100 });
			const program = yield* upgrade(session, [file]);
			yield* session.next({ contains: "Resolved 1 package" });
			const table = yield* session.next({ contains: "Choose versions to update" });
			yield* table.press("right", "escape"); // a pick, then Esc discards it
			expect(Exit.isSuccess(yield* Fiber.await(program))).toBe(true);
			expect(yield* session.stdout).toContain("cancelled; nothing written");
			expect(readFileSync(file, "utf8")).toBe(SOURCE);
		}),
	);

	it.effect("Ctrl-C on the table stays an interrupt: the Cancelled reaches the runtime (exit 130)", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(SOURCE);
			const session = yield* CliUiTest.session({ color: "none", columns: 100 });
			const program = yield* upgrade(session, [file]);
			yield* session.next({ contains: "Resolved 1 package" });
			const table = yield* session.next({ contains: "Choose versions to update" });
			yield* table.press("right", "ctrl+c");
			const exit = yield* Fiber.await(program);
			expect(CliUiTest.cancelReason(exit)).toEqual(Option.some("interrupt"));
			expect(readFileSync(file, "utf8")).toBe(SOURCE);
		}),
	);

	it.effect("not interactive: prints the default picks, mounts no screen and draws no progress", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(SOURCE);
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const program = yield* upgrade(session, [file]);
			expect(Exit.isSuccess(yield* Fiber.await(program))).toBe(true);
			expect(yield* session.mounts).toBe(0);
			const stdout = yield* session.stdout;
			expect(stdout).toContain("(not interactive — run with --yes to apply, or in a terminal to choose)");
			expect(yield* session.transcript).not.toContain("Resolved 1 package");
			expect(readFileSync(file, "utf8")).toBe(SOURCE);
		}),
	);
});
