#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { exportCommand } from "./commands/export.js";
import { previewCommand } from "./commands/preview.js";
import { upgradeCommand } from "./commands/upgrade.js";

const root = Command.make("rolldown-pnpm-config").pipe(
	Command.withSubcommands([upgradeCommand, exportCommand, previewCommand]),
);

Command.run(root, { version: process.env.__PACKAGE_VERSION__ ?? "0.0.0" }).pipe(
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain,
);
