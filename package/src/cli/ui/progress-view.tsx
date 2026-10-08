import { Status } from "@effected/cli";
import { Styled, useGlyphs, useTheme } from "@effected/cli/ui";
import { Text } from "ink";
import type { ReactElement } from "react";
import type { ProgressState } from "./progress.js";

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
 * The resolve-progress view: one spinner line naming the phase and its count,
 * committed as a check-marked line carrying the phase's finished label when it
 * ends. Loaded only when a run draws it (`CliUi.lazyView` in `screens.ts`), so
 * this module — and React with it — stays off every run that never draws.
 *
 * @internal
 */
export default function progressView(state: ProgressState, frame: number): ReactElement {
	return <Progress state={state} frame={frame} />;
}
