#!/usr/bin/env node
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { exportCommand } from "./commands/export.js";
import { upgradeCommand } from "./commands/upgrade.js";

const root = Command.make("rolldown-pnpm-config").pipe(Command.withSubcommands([upgradeCommand, exportCommand]));

const cli = Command.run(root, { name: "rolldown-pnpm-config", version: process.env.__PACKAGE_VERSION__ ?? "0.0.0" });

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
