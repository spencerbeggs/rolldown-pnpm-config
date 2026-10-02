import { join } from "node:path";
import { Context, Effect } from "effect";
import { findWorkspaceFile } from "./workspace-file.js";

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
 * The `pnpm-workspace.yaml` a command targets: the explicit path when given,
 * else the nearest one upward from the working directory, else the working
 * directory's own (to be created).
 *
 * @internal
 */
export function resolveWorkspacePath(explicit: string | undefined): Effect.Effect<string, never, WorkingDirectory> {
	return Effect.map(WorkingDirectory, (cwd) => explicit ?? findWorkspaceFile(cwd) ?? join(cwd, "pnpm-workspace.yaml"));
}
