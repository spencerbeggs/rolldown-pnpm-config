import type { Base } from "../../src/runtime/types.js";

/** The frozen `base.catalogs` map, typed for indexing (freeze always emits it). */
export function catalogsOf(base: Base): Record<string, Record<string, string>> {
	return (base.catalogs ?? {}) as Record<string, Record<string, string>>;
}
