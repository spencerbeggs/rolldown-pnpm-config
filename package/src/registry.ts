import { DESCRIPTORS, deriveRegistry } from "./descriptors/index.js";

/** Maps each known pnpm field to its strategy + default enforcement. Derived from the descriptor table. @internal */
export const FIELD_REGISTRY = deriveRegistry(DESCRIPTORS);
