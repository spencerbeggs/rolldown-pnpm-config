import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERSION, runBin, workspaceCopy } from "./utils/bin.js";

// The exit code and the bytes on each stream are a property of the BUILT bin,
// wired through the real platform layer and CliRuntime.main — only spawning it
// proves them. Every case here stays offline (no registry lookups).
describe("rolldown-pnpm-config bin", () => {
	it("prints its version and exits 0", async () => {
		const r = await runBin(["--version"]);
		expect(r.exitCode).toBe(0);
		// The build substitutes the real version; a source run would say 0.0.0.
		expect(r.stdout.trim()).toBe(`rolldown-pnpm-config v${VERSION}`);
		expect(r.stderr).toBe("");
	});

	it("exits 64 on an invalid flag combination, reporting on stderr only", async () => {
		const r = await runBin(["upgrade", "--json"], { cwd: workspaceCopy() });
		expect(r.exitCode).toBe(64);
		expect(r.stdout).toBe("");
		expect(r.stderr).toContain("--json requires a non-interactive mode");
		expect(r.stderr).not.toContain("UpgradeUsageError");
	});

	it("exits 64 on an unknown flag, with the help on stderr so stdout stays clean", async () => {
		const r = await runBin(["upgrade", "--bogus"]);
		expect(r.exitCode).toBe(64);
		expect(r.stdout).toBe("");
		expect(r.stderr).toContain("Unrecognized flag: --bogus");
		expect(r.stderr).toContain("USAGE");
	});

	it("writes the file on a plain export and reports it on stdout", async () => {
		const cwd = workspaceCopy();
		const r = await runBin(["export"], { cwd });
		expect(r.exitCode).toBe(0);
		expect(r.stdout.trim()).toBe(`✓ Exported to ${join(cwd, "pnpm-workspace.yaml")}`);
		expect(readFileSync(join(cwd, "pnpm-workspace.yaml"), "utf8")).toContain("publicHoistPattern");
	});

	it("keeps --check --json's one-document contract even when no config is found", async () => {
		const r = await runBin(["upgrade", "--check", "--json", "--ci"]);
		expect(r.exitCode).toBe(1);
		const doc = JSON.parse(r.stdout) as { command: string; inSync: boolean; error: { kind: string; message: string } };
		expect(r.stdout).toBe(`${JSON.stringify(doc)}\n`);
		expect(doc).toMatchObject({ command: "check", inSync: false, error: { kind: "resolution" } });
		expect(doc.error.message).toContain("No config file found");
		expect(r.stderr).toContain("(resolution error, not drift):");
	});

	it("keeps the one-document contract for an explicit config path that does not exist", async () => {
		// A missing path must reach the handler (not fail in the parser with an empty
		// stdout), so a gate piping into jq always gets a document.
		const r = await runBin(["upgrade", "missing.config.ts", "--check", "--json", "--ci"]);
		expect(r.exitCode).toBe(1);
		const doc = JSON.parse(r.stdout) as { command: string; error: { kind: string; message: string } };
		expect(doc).toMatchObject({ command: "check", error: { kind: "resolution" } });
		// The parser resolves the path against the working directory, so the message names it absolutely.
		expect(doc.error.message).toMatch(/^Cannot read \/.*missing\.config\.ts$/);
	});

	it("labels a --check failure as not-drift on stderr, with stdout empty", async () => {
		// A gate runs as CI: the label is one unbroken line a log search can match.
		const r = await runBin(["upgrade", "--check", "--ci"]);
		expect(r.exitCode).toBe(1);
		expect(r.stdout).toBe("");
		expect(r.stderr).toContain(
			"Catalog check failed before drift could be evaluated (resolution error, not drift):\n  No config file found.",
		);
	});

	it("exits 1 with a one-line report when no config file is found", async () => {
		const r = await runBin(["export"]);
		expect(r.exitCode).toBe(1);
		expect(r.stdout).toBe("");
		expect(r.stderr.trim()).toBe("✗ No config file found. Pass a file path explicitly.");
	});

	it("prints an escape-free diff under --dry-run and writes nothing", async () => {
		const cwd = workspaceCopy();
		const before = readFileSync(join(cwd, "pnpm-workspace.yaml"), "utf8");
		const r = await runBin(["export", "--dry-run"], { cwd });
		expect(readFileSync(join(cwd, "pnpm-workspace.yaml"), "utf8")).toBe(before);
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toContain("(dry run — not written)");
		expect(r.stdout).toContain("+ publicHoistPattern:");
		expect(r.stdout).toContain("  packages:  (unmanaged)");
		// No colour without a terminal (and NO_COLOR is set): no legend, no escapes.
		expect(r.stdout).not.toContain("Legend:");
		expect(r.stdout).not.toContain("\u001b[");
	});

	it("colours for a person when FORCE_COLOR is set, and never for an agent", async () => {
		const human = await runBin(["export", "--dry-run"], { cwd: workspaceCopy(), env: { FORCE_COLOR: "1" } });
		expect(human.stdout).toContain("Legend:");
		expect(human.stdout).toContain("\u001b[");
		const agent = await runBin(["export", "--dry-run", "--agent"], { cwd: workspaceCopy(), env: { FORCE_COLOR: "1" } });
		expect(agent.exitCode).toBe(0);
		expect(agent.stdout).not.toContain("\u001b[");
		expect(agent.stdout).not.toContain("Legend:");
	});

	it("prints the Changes view instead of the explorer when it cannot prompt", async () => {
		const r = await runBin(["preview"], { cwd: workspaceCopy() });
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toContain("+ publicHoistPattern:");
		expect(r.stdout).not.toContain("Simulated");
	});

	it("rejects two audience flags as a usage error", async () => {
		const r = await runBin(["export", "--agent", "--ci"], { cwd: workspaceCopy() });
		expect(r.exitCode).toBe(64);
		expect(r.stdout).toBe("");
	});
});
