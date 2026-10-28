import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";

/**
 * Provide the real Node `FileSystem` to a test body. The CLI's IO goes through
 * the platform `FileSystem` service, and these suites drive it against real
 * temp directories (mkdtemp), so they need the Node implementation rather than
 * a double. Provided per test (not a suite-level `layer(...)`) so the
 * per-test `TestClock` several suites drive stays isolated.
 */
export const provideNodeFs = Effect.provide(NodeFileSystem.layer);
