import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";

/**
 * Provide the real Node `FileSystem` and `Path` to a test body. The CLI's IO
 * goes through those platform services (atomic writes need both), and these
 * suites drive it against real temp directories (mkdtemp), so they need the
 * Node implementations rather than doubles. Provided per test (not a
 * suite-level `layer(...)`) so the per-test `TestClock` several suites drive
 * stays isolated.
 */
export const provideNodeFs = Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer));
