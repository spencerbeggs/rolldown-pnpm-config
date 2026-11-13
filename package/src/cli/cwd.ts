import { join } from "node:path";
import { locateWorkspaceRootSync } from "@effected/workspaces";
import { nodeSyncOps } from "@effected/workspaces/node-sync";
import { Context, Effect } from "effect";

/**
 * The directory the CLI was invoked from. `main.ts` reads `process.cwd()` once
 * and provides it here, so no command reads `process` itself.
 *
 * @internal
 */
export class WorkingDirectory extends Context.Service<WorkingDirectory, string>()(
	"rolldown-pnpm-config/WorkingDirectory",
) {}

/**
 * Walk up from `startDir` to the nearest directory containing a
 * `pnpm-workspace.yaml`; returns the file path or null. A `package.json`
 * `workspaces` field is not a marker here: this tool targets pnpm only.
 *
 * @internal
 */
export function findWorkspaceFile(startDir: string): string | null {
	return locateWorkspaceRootSync(startDir, { ...nodeSyncOps, markers: ["pnpm-workspace.yaml"] })?.path ?? null;
}

/**
 * The `pnpm-workspace.yaml` a command targets: the explicit path when given,
 * else the nearest one upward from the working directory, else the working
 * directory's own (to be created).
 *
 * @internal
 */
export function resolveWorkspacePath(explicit: string | undefined): Effect.Effect<string, never, WorkingDirectory> {
	return Effect.map(WorkingDirectory, (cwd) => explicit ?? findWorkspaceFile(cwd) ?? join(cwd, "pnpm-workspace.yaml"));
}
