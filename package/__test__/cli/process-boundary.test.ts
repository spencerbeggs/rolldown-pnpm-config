import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { SourceBoundary } from "@effected/workspaces/testing";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../../src/cli/", import.meta.url));

// Every `process` read (cwd, env, argv, isTTY) and every direct stdout write
// lives in the entry files and is passed down as a plain value; commands,
// renderers and screens reach the terminal only through the kit's services,
// so they render the same for a person, an agent, CI and a test.
describe("CLI process boundary", () => {
	it("the scanner's own fixtures still pass", () => {
		expect(SourceBoundary.verifyFixtures()).toEqual([]);
	});

	it("reads process and writes stdout only in bin.ts, main.ts and version.ts", async () => {
		const scan = await Effect.runPromise(
			SourceBoundary.scan({
				root: CLI,
				rules: ["process", "node:process", "stdout-write", "console"],
				allow: ["bin.ts", "main.ts", "version.ts"],
				extensions: [".ts", ".tsx"],
			}).pipe(Effect.provide(NodeServices.layer)),
		);
		expect(scan.files.length).toBeGreaterThan(30);
		expect(scan.violations).toEqual([]);
	});
});
