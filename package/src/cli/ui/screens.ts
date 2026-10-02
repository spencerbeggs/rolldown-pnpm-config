import type { CliTheme } from "@effected/cli";
import { CliInteractive } from "@effected/cli";
import type { Screen } from "@effected/cli/ui";
import { CliUi } from "@effected/cli/ui";
import { Effect, PubSub } from "effect";
import type { PreviewViews } from "../preview-views.js";
import type { Decision } from "../walk-types.js";
import type { ProgressEvent } from "./progress.js";
import type { WalkScreenProps } from "./walk-screen.js";

// This module is what the commands import. It holds no JSX and imports
// neither `ink` nor `react`: each screen's module is loaded only when the
// screen mounts (`CliUi.lazy`), so `--yes`, `--check`, `--json`, an agent or a
// CI run never loads React.

/** The interactive upgrade table, loaded on mount. @internal */
export function walkScreen(props: WalkScreenProps): Screen<Decision[]> {
	return CliUi.lazy(async () => ({ default: (await import("./walk-screen.js")).makeWalkScreen(props) }));
}

/** The read-only preview explorer, loaded on mount. @internal */
export function previewScreen(views: PreviewViews): Screen<void> {
	return CliUi.lazy(async () => ({ default: (await import("./preview-screen.js")).makePreviewScreen(views) }));
}

/**
 * Run `body` with a progress reporter. In an interactive run the reports
 * drive a live spinner view that redraws in place; otherwise the reporter is a
 * no-op and nothing is drawn or loaded, so piped and CI output stay clean. The
 * view is closed — its last frame committed — before this returns, so a
 * screen mounted next never waits on it.
 *
 * @internal
 */
export function withProgress<A, E, R>(
	body: (report: (event: ProgressEvent) => Effect.Effect<void>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | CliTheme> {
	return Effect.gen(function* () {
		if (!(yield* CliInteractive)) return yield* body(() => Effect.void);
		// The live view's render is synchronous, so its module is imported up front —
		// but only here, on the path that draws.
		const { progressView } = yield* Effect.promise(() => import("./progress-view.js"));
		return yield* Effect.scoped(
			Effect.gen(function* () {
				const pubsub = yield* PubSub.unbounded<ProgressEvent>();
				// Subscribe before anything publishes, so the view misses nothing.
				const events = yield* PubSub.subscribe(pubsub);
				const view = yield* CliUi.live({ ...progressView, events });
				return yield* body((event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid)).pipe(
					Effect.ensuring(view.close),
				);
			}),
		);
	});
}
