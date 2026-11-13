import { describe, expect, it } from "@effect/vitest";
import { CliUiTest } from "@effected/cli-kit/ui/testing";
import { Effect, Exit, Layer } from "effect";
import { UpgradeError, unresolvedMessage } from "../../src/cli/commands/upgrade.js";
import { RegistryResolver, ResolveError } from "../../src/cli/resolve.js";
import { WORKSPACE_FILES, liveResolverWorld } from "./utils/registry-world.js";
import { failureOf, runUpgradeCommand } from "./utils/run-upgrade.js";
import { makeStubResolver } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { alpha: { packages: { typescript: "^5.9.0", "@acme/kit": "^1.0.0" } } },
});
`;

const session = CliUiTest.session({ color: "none", interactive: false });

describe("upgrade reports why a package did not resolve", () => {
	it.effect("fails once with the configuration's cause when the npmrc cannot be read", () =>
		Effect.gen(function* () {
			const { "/repo/.npmrc": _npmrc, ...rest } = WORKSPACE_FILES;
			const world = liveResolverWorld({ ...rest, "/repo/.npmrc/nested": "" });
			const s = yield* session;
			const exit = yield* runUpgradeCommand(s, world, ["--preview", writeTmpConfig(CONFIG)]);
			expect(Exit.isFailure(exit)).toBe(true);
			const failure = failureOf(exit);
			expect(failure).toBeInstanceOf(UpgradeError);
			expect((failure as UpgradeError).message).toContain("Cannot read the registry configuration");
			expect((failure as UpgradeError).message).toContain(".npmrc");
			expect((failure as UpgradeError).message).not.toContain("typo");
		}),
	);

	it.effect("prints each package's own cause beside it on stderr", () =>
		Effect.gen(function* () {
			const stub = makeStubResolver({ versions: { typescript: ["5.9.0"] } });
			const resolver = Layer.succeed(RegistryResolver, {
				...stub,
				versions: (pkg: string) =>
					pkg === "@acme/kit"
						? Effect.fail(new ResolveError({ pkg, message: "the registry answered 401 for @acme/kit" }))
						: Effect.succeed(["5.9.0"]),
			});
			const s = yield* session;
			const exit = yield* runUpgradeCommand(s, resolver, ["--preview", writeTmpConfig(CONFIG)]);
			expect(Exit.isSuccess(exit)).toBe(true);
			const stderr = yield* s.stderr;
			expect(stderr).toContain("@acme/kit");
			expect(stderr).toContain("the registry answered 401");
		}),
	);

	it.effect("reports a publish-times failure with its cause instead of reading it as too young", () =>
		Effect.gen(function* () {
			const stub = makeStubResolver({});
			const resolver = Layer.succeed(RegistryResolver, {
				...stub,
				versions: (pkg: string) => Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3"] : ["1.0.0"]),
				pnpmReleaseAge: () => Effect.succeed({ ageMinutes: 60 }),
				times: (pkg: string) =>
					pkg === "typescript"
						? Effect.fail(new ResolveError({ pkg, message: "times read failed" }))
						: Effect.succeed({ "1.0.0": "2020-01-01T00:00:00.000Z" }),
			});
			const s = yield* session;
			yield* runUpgradeCommand(s, resolver, ["--preview", writeTmpConfig(CONFIG)]);
			expect(yield* s.stderr).toContain("times read failed");
		}),
	);
});

describe("unresolvedMessage", () => {
	it("states one shared cause once", () => {
		const causes = new Map([
			["a", "boom"],
			["b", "boom"],
		]);
		expect(unresolvedMessage(["a", "b"], causes)).toBe(
			"Could not resolve 2 packages from the registry (boom) — check each name for a typo, or your registry auth:\n  a\n  b",
		);
	});

	it("puts distinct causes beside their packages", () => {
		const causes = new Map([
			["a", "x"],
			["b", "y"],
		]);
		expect(unresolvedMessage(["a", "b"], causes)).toContain("  a: x\n  b: y");
	});
});
