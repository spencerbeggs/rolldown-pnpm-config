import type { Strategy } from "../types.js";
import { arrayRecordUnion, arrayUnion } from "./arrays.js";
import { catalogs } from "./catalogs.js";
import { allowBuilds, mapChildWins } from "./maps.js";
import { overrides, peerDependencyRules } from "./overrides.js";
import { scalar, securityFlag, securityMin } from "./scalar.js";

/**
 * Built-in strategies keyed by manifest name.
 *
 * @internal
 */
export const STRATEGY_TABLE: Record<string, Strategy> = {
	scalar,
	catalogs,
	mapChildWins,
	arrayUnion,
	arrayRecordUnion,
	overrides,
	peerDependencyRules,
	securityFlag,
	securityMin,
	allowBuilds,
};
