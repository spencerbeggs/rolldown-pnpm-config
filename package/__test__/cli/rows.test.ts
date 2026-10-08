import { describe, expect, it } from "@effect/vitest";
import { CliEnv, CliLinks, Doc, Render } from "@effected/cli";
import { Effect, Layer } from "effect";
import { TestConsole } from "effect/testing";
import { printView } from "../../src/cli/render/print.js";
import { row, tone } from "../../src/cli/render/tone.js";

// Rows far wider than the 20-column terminal below, plus an empty row and a
// toned row, so every rendering path a diff takes is covered.
const LONG = "packageExtensions: some-really-long-package-name@^1.2.3";
const block = Doc.lines([
	row("+", 0, [tone(LONG, "added")]),
	row(" ", 1, [tone("unchanged-key: value-that-is-also-long", "unchanged")], "local"),
	[],
	row("~", 0, [tone("catalog: a → b and then some more text", "changed")]),
]);

describe("Doc.lines with wrap: false", () => {
	// Piped, agent and CI output has no width, so `wrap: false` must not
	// change one byte of it, in any renderer that output goes through.
	it.each([
		["plain (agent)", Render.plain, Render.contextOf({ audience: "agent" })],
		["ansi (human, piped)", Render.ansi, Render.contextOf({ audience: "human", color: "256" })],
		["githubLog (ci)", Render.githubLog, Render.contextOf({ audience: "ci" })],
	] as const)("renders exactly as the plain Lines block, unbounded: %s", (_, render, ctx) => {
		expect(render([Doc.lines(block.lines, { wrap: false })], ctx)).toBe(render([block], ctx));
	});
});

// A person's 20-column terminal: the one place a width applies.
const narrowTerminal = Layer.mergeAll(
	CliEnv.layerTest({ tty: true, columns: 20, audience: "human" }),
	CliLinks.layerTest("off"),
);

describe("printing at a finite terminal width", () => {
	it.effect("the control: a Lines block wraps at the terminal width", () =>
		Effect.gen(function* () {
			yield* Doc.print([block]);
			const [out] = yield* TestConsole.logLines;
			// Proves the harness has a width at all, so the next test can fail.
			expect(String(out).split("\n").length).toBeGreaterThan(block.lines.length);
		}).pipe(Effect.provide(narrowTerminal)),
	);

	it.effect("keeps every diff row whole on one line, while the heading wraps", () =>
		Effect.gen(function* () {
			const heading = "a heading that is longer than twenty columns";
			yield* printView(block, { heading });
			const [out] = yield* TestConsole.logLines;
			const lines = String(out).split("\n");
			expect(lines).toContain(`+ ${LONG}`);
			expect(lines).toContain("~ catalog: a → b and then some more text");
			// The heading is prose: it wraps at the terminal.
			expect(lines).not.toContain(heading);
		}).pipe(Effect.provide(narrowTerminal)),
	);
});
