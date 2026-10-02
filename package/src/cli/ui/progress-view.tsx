import { Status } from "@effected/cli";
import type { LiveOptions } from "@effected/cli/ui";
import { Styled, useGlyphs, useTheme } from "@effected/cli/ui";
import { Text } from "ink";
import type { ReactElement } from "react";
import type { ProgressEvent, ProgressState } from "./progress.js";
import { initialProgress, reduceProgress } from "./progress.js";

function Progress({ state, frame }: { readonly state: ProgressState; readonly frame: number }): ReactElement {
	const glyphs = useGlyphs();
	const theme = useTheme();
	const count = state.total > 0 ? ` ${state.done}/${state.total}` : "";
	if (state.finished) {
		return (
			<Text>
				{theme.status(Status.core, "success")} {state.label}
			</Text>
		);
	}
	return (
		<Text>
			<Styled token="accent">{glyphs.spinner[frame % glyphs.spinner.length]}</Styled> {state.label}
			{count}
		</Text>
	);
}

/**
 * The resolve-progress live view, minus its events: one spinner line naming
 * the phase and its count, committed as a check-marked line carrying the
 * phase's finished label when it ends.
 * Shared by the command and its test so the two never drift.
 *
 * @internal
 */
export const progressView: Omit<LiveOptions<ProgressEvent, ProgressState>, "events"> = {
	initial: initialProgress,
	reduce: reduceProgress,
	render: (state, frame) => <Progress state={state} frame={frame} />,
	isStart: (event) => event._tag === "Phase",
	isTerminal: (event) => event._tag === "Finished",
};
