import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { RegistryResolver, ResolveError, parsePeerDeps, parseTimes, parseVersions } from "../../src/cli/resolve.js";

const StubOk = Layer.succeed(RegistryResolver, {
	versions: (pkg) => Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3"] : []),
	times: () => Effect.succeed({}),
	peerDependencies: () => Effect.succeed({}),
	pnpmConfig: () => Effect.succeed(null),
});

describe("RegistryResolver (contract)", () => {
	it("returns the versions for a package", async () => {
		const out = await Effect.runPromise(
			Effect.gen(function* () {
				const r = yield* RegistryResolver;
				return yield* r.versions("typescript");
			}).pipe(Effect.provide(StubOk)),
		);
		expect(out).toEqual(["5.9.0", "5.9.3"]);
	});

	it("ResolveError carries the package name", () => {
		const err = new ResolveError({ pkg: "x", message: "boom" });
		expect(err.pkg).toBe("x");
	});
});

describe("parseVersions", () => {
	it("parses a JSON array of versions", async () => {
		const result = await Effect.runPromise(parseVersions("typescript", '["5.9.0","5.9.3"]'));
		expect(result).toEqual(["5.9.0", "5.9.3"]);
	});

	it("parses a single JSON string (single-version package)", async () => {
		const result = await Effect.runPromise(parseVersions("tiny-pkg", '"1.0.0"'));
		expect(result).toEqual(["1.0.0"]);
	});

	it("returns a ResolveError for malformed JSON", async () => {
		const result = await Effect.runPromise(Effect.either(parseVersions("bad-pkg", "not-json")));
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left).toBeInstanceOf(ResolveError);
			expect(result.left.pkg).toBe("bad-pkg");
		}
	});

	it("returns a ResolveError for an unexpected JSON shape (number)", async () => {
		const result = await Effect.runPromise(Effect.either(parseVersions("num-pkg", "42")));
		expect(result._tag).toBe("Left");
	});
});

describe("parseTimes", () => {
	it("parses the npm time object, ignoring created/modified keys", async () => {
		const out = await Effect.runPromise(
			parseTimes("p", JSON.stringify({ created: "x", modified: "y", "1.0.0": "2025-01-01T00:00:00Z" })),
		);
		expect(out).toEqual({ created: "x", modified: "y", "1.0.0": "2025-01-01T00:00:00Z" });
	});

	it("returns a ResolveError on malformed JSON", async () => {
		const r = await Effect.runPromise(Effect.either(parseTimes("p", "nope")));
		expect(r._tag).toBe("Left");
	});
});

describe("parsePeerDeps", () => {
	it("parses a peerDependencies object", async () => {
		const out = await Effect.runPromise(parsePeerDeps("p", '{"effect":"^3.17.0"}'));
		expect(out).toEqual({ effect: "^3.17.0" });
	});

	it("treats empty stdout as no peer deps", async () => {
		expect(await Effect.runPromise(parsePeerDeps("p", ""))).toEqual({});
		expect(await Effect.runPromise(parsePeerDeps("p", "\n"))).toEqual({});
	});
});
