import { expectTypeOf } from "vitest";
import type { LocalDirective, PluginConfig } from "../../src/define-plugin.js";

// LocalDirective is exported and all fields optional
expectTypeOf<LocalDirective<string[]>>().toMatchTypeOf<{ value?: string[] }>();

// local.overrides accepts BOTH a raw record and a directive
type Local = NonNullable<PluginConfig["local"]>;
expectTypeOf<{ overrides: Record<string, string> }>().toMatchTypeOf<Local>();
expectTypeOf<{ overrides: LocalDirective<Record<string, string>> }>().toMatchTypeOf<Local>();
expectTypeOf<{ publicHoistPattern: LocalDirective<string[]> }>().toMatchTypeOf<Local>();
