// package/__test__/types/patches.test-d.ts
import type { PluginConfig } from "../../src/define-plugin.js";

// rewrite directive on patchedDependencies
const a: PluginConfig["patchedDependencies"] = { strategy: "rewrite" };
// plain map still allowed
const b: PluginConfig["patchedDependencies"] = { "is-odd@3.0.1": "patches/is-odd.patch" };
// localPatchesDir + merge directive on local
const c: PluginConfig["local"] = {
	localPatchesDir: "public/patches",
	patchedDependencies: { strategy: "merge" },
};
void a;
void b;
void c;
