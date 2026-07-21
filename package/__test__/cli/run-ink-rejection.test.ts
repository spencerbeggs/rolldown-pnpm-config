import { Cause, Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

// Mock `ink` so render() returns an instance whose waitUntilExit() rejects,
// simulating an Ink crash / error unmount. render is mocked, so the real Preview
// / Walk components are never invoked — their ink / ink-tab imports are inert.
const rejection = new Error("ink boom");
vi.mock("ink", () => ({
	render: () => ({
		waitUntilExit: () => Promise.reject(rejection),
		unmount: () => {},
		clear: () => {},
		rerender: () => {},
		cleanup: () => {},
	}),
	Box: () => null,
	Text: () => null,
	useApp: () => ({ exit: () => {} }),
	useInput: () => {},
}));

const { runPreview } = await import("../../src/cli/ui/run-preview.js");
const { runWalk } = await import("../../src/cli/ui/run-walk.js");

describe("Ink runner rejection handling (#37)", () => {
	// Without the .catch the fiber never resumes and these time out (the bug).
	it("runPreview dies (does not hang) when waitUntilExit rejects", { timeout: 2000 }, async () => {
		const exit = await Effect.runPromiseExit(runPreview({ changes: [], full: [], simulated: [] }));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true);
	});

	it("runWalk dies (does not hang) when waitUntilExit rejects", { timeout: 2000 }, async () => {
		const exit = await Effect.runPromiseExit(runWalk([]));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true);
	});
});
