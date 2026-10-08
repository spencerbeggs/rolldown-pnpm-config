import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
	RegistryResolver,
	ResolveError,
	parsePeerDeps,
	parseTimes,
	parseVersions,
	stripPnpmNotices,
} from "../../src/cli/resolve.js";

const StubOk = Layer.succeed(RegistryResolver, {
	versions: (pkg) => Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3"] : []),
	times: () => Effect.succeed({}),
	peerDependencies: () => Effect.succeed({}),
	pnpmConfig: () => Effect.succeed(null),
});

describe("RegistryResolver (contract)", () => {
	it.effect("returns the versions for a package", () =>
		Effect.gen(function* () {
			const out = yield* Effect.gen(function* () {
				const r = yield* RegistryResolver;
				return yield* r.versions("typescript");
			}).pipe(Effect.provide(StubOk));
			expect(out).toEqual(["5.9.0", "5.9.3"]);
		}),
	);

	it("ResolveError carries the package name", () => {
		const err = new ResolveError({ pkg: "x", message: "boom" });
		expect(err.pkg).toBe("x");
	});
});

describe("stripPnpmNotices", () => {
	const banner = "[WARN] This project is configured to use 12.5.0+sha512.abc of pnpm. Your current pnpm is v12.4.2\n";

	it.effect("drops a packageManager-mismatch banner printed ahead of the JSON payload", () =>
		Effect.gen(function* () {
			const out = yield* parseVersions("typescript", stripPnpmNotices(`${banner}["5.9.0","5.9.3"]\n`));
			expect(out).toEqual(["5.9.0", "5.9.3"]);
		}),
	);

	it("drops the bare-WARN spelling and leaves clean output untouched", () => {
		expect(stripPnpmNotices(' WARN  deprecated thing\n{"a":"1"}\n')).toBe('{"a":"1"}\n');
		expect(stripPnpmNotices('["1.0.0"]')).toBe('["1.0.0"]');
	});

	it("leaves a `pnpm config get` value readable when the banner precedes it", () => {
		expect(stripPnpmNotices(`${banner}undefined\n`).trim()).toBe("undefined");
	});
});

describe("parseVersions", () => {
	it.effect("parses a JSON array of versions", () =>
		Effect.gen(function* () {
			const result = yield* parseVersions("typescript", '["5.9.0","5.9.3"]');
			expect(result).toEqual(["5.9.0", "5.9.3"]);
		}),
	);

	it.effect("parses a single JSON string (single-version package)", () =>
		Effect.gen(function* () {
			const result = yield* parseVersions("tiny-pkg", '"1.0.0"');
			expect(result).toEqual(["1.0.0"]);
		}),
	);

	it.effect("returns a ResolveError for malformed JSON", () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(parseVersions("bad-pkg", "not-json"));
			expect(result._tag).toBe("Failure");
			if (result._tag === "Failure") {
				expect(result.failure).toBeInstanceOf(ResolveError);
				expect(result.failure.pkg).toBe("bad-pkg");
			}
		}),
	);

	it.effect("returns a ResolveError for an unexpected JSON shape (number)", () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(parseVersions("num-pkg", "42"));
			expect(result._tag).toBe("Failure");
		}),
	);
});

describe("parseTimes", () => {
	it.effect("parses the npm time object, preserving all keys including created/modified", () =>
		Effect.gen(function* () {
			const out = yield* parseTimes(
				"p",
				JSON.stringify({ created: "x", modified: "y", "1.0.0": "2025-01-01T00:00:00Z" }),
			);
			expect(out).toEqual({ created: "x", modified: "y", "1.0.0": "2025-01-01T00:00:00Z" });
		}),
	);

	it.effect("returns a ResolveError on malformed JSON", () =>
		Effect.gen(function* () {
			const r = yield* Effect.result(parseTimes("p", "nope"));
			expect(r._tag).toBe("Failure");
		}),
	);
});

describe("parsePeerDeps", () => {
	it.effect("parses a peerDependencies object", () =>
		Effect.gen(function* () {
			const out = yield* parsePeerDeps("p", '{"effect":"^3.17.0"}');
			expect(out).toEqual({ effect: "^3.17.0" });
		}),
	);

	it.effect("treats empty stdout as no peer deps", () =>
		Effect.gen(function* () {
			expect(yield* parsePeerDeps("p", "")).toEqual({});
			expect(yield* parsePeerDeps("p", "\n")).toEqual({});
		}),
	);
});
