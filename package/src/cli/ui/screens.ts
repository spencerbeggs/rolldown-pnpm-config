import type { CliTheme } from "@effected/cli";
import type { LiveOptions, Screen } from "@effected/cli/ui";
import { CliUi } from "@effected/cli/ui";
import { Effect, PubSub } from "effect";
import type { PreviewViews } from "../preview-views.js";
import type { Decision } from "../walk-types.js";
import type { ProgressEvent, ProgressState } from "./progress.js";
import { initialProgress, reduceProgress } from "./progress.js";
import type { WalkScreenProps } from "./walk-screen.js";

// This module is what the commands import. It holds no JSX and imports
// neither `ink` nor `react`: each screen's module is loaded only when the
// screen mounts (`CliUi.lazy`), and the progress view's only when a run draws
// it (`CliUi.lazyView`), so `--yes`, `--check`, `--json`, an agent or a CI run
// never loads React. The view module imports only the model (`progress.ts`),
// never this one, so the lazy import closes no cycle.

/** The interactive upgrade table, loaded on mount. @internal */
export function walkScreen(props: WalkScreenProps): Screen<Decision[]> {
	return CliUi.lazy(async () => ({ default: (await import("./walk-screen.js")).makeWalkScreen(props) }));
}

/** The read-only preview explorer, loaded on mount. @internal */
export function previewScreen(views: PreviewViews): Screen<void> {
	return CliUi.lazy(async () => ({ default: (await import("./preview-screen.js")).makePreviewScreen(views) }));
}

/**
 * The resolve-progress live view, minus its events: one spinner line per
 * phase, committed as a check-marked line when the phase finishes. A run that
 * cannot draw (a pipe, CI, an agent) prints nothing: `final` is the empty
 * document, so stdout carries only the command's own output, and neither the
 * view's module nor Ink nor React is loaded.
 *
 * @internal
 */
export const progressOptions: Omit<LiveOptions<ProgressEvent, ProgressState>, "events"> = {
	initial: initialProgress,
	reduce: reduceProgress,
	render: CliUi.lazyView(() => import("./progress-view.js")),
	final: () => [],
	isStart: (event) => event._tag === "Phase",
	isTerminal: (event) => event._tag === "Finished",
};

/**
 * Run `body` with a progress reporter whose reports drive the live view. In an
 * interactive run it redraws in place; otherwise it draws and prints nothing
 * (see {@link progressOptions}). The view is closed — its last frame committed
 * — before this returns, so a screen mounted next never waits on it.
 *
 * @internal
 */
export function withProgress<A, E, R>(
	body: (report: (event: ProgressEvent) => Effect.Effect<void>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | CliTheme> {
	return Effect.scoped(
		Effect.gen(function* () {
			const pubsub = yield* PubSub.unbounded<ProgressEvent>();
			// Subscribe before anything publishes, so the view misses nothing.
			const events = yield* PubSub.subscribe(pubsub);
			const view = yield* CliUi.live({ ...progressOptions, events });
			return yield* body((event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid)).pipe(
				Effect.ensuring(view.close),
			);
		}),
	);
}
