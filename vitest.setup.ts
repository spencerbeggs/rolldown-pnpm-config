import { AgentPlugin } from "@vitest-agent/plugin";

export function setup() {
	// The package's e2e suite spawns its prod bin (`build`, the only artifact `effected package build` emits); the
	// example consumers' suites read their own dev target (`build:dev`).
	AgentPlugin.runScript("pnpm turbo run build build:dev");
}
