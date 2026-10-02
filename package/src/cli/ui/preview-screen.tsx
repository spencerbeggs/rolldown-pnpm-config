import { Doc } from "@effected/cli";
import type { Screen, ViewportRow } from "@effected/cli/ui";
import {
	DocView,
	KeyHelp,
	KeyTable,
	Styled,
	Tabs,
	Viewport,
	useKeys,
	useTerminalSize,
	useTheme,
} from "@effected/cli/ui";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type { PreviewViews } from "../preview-views.js";
import { legend, simulatedLegend } from "../render/legend.js";

type ViewName = keyof PreviewViews;

const TABS: ReadonlyArray<{ readonly name: ViewName; readonly label: string }> = [
	{ name: "changes", label: "Changes" },
	{ name: "full", label: "Full" },
	{ name: "simulated", label: "Simulated" },
];

/** `q` and Enter close the viewer; Esc and Ctrl-C are the host's (the command treats them as a close too). */
const close = KeyTable.make<"close">([{ keys: [{ char: "q" }, "enter"], action: "close", help: "close" }]);

/**
 * Lines the viewer's chrome takes besides the scrolling view: tabs, legend and
 * key help, plus one so the frame stays shorter than the terminal (Ink clears
 * the screen and scrollback for a frame as tall as the terminal).
 */
const RESERVED = 4;

function rowsOf(views: PreviewViews, name: ViewName): ReadonlyArray<ViewportRow> {
	return views[name].lines.map((_, i) => ({ _tag: "Item", key: String(i) }));
}

/**
 * The read-only preview explorer: a tab bar over the Changes / Full /
 * Simulated views, each scrolling in a viewport that fits the terminal, with
 * the matching legend above it. Resolves when the viewer is closed.
 *
 * @internal
 */
export function makePreviewScreen(views: PreviewViews): Screen<void> {
	return ({ resolve }) => {
		const Preview = (): ReactElement => {
			const height = Math.max(1, useTerminalSize().rows - RESERVED);
			const [tab, setTab] = useState<ViewName>("changes");
			const [viewport, setViewport] = useState(() => Viewport.init(views.changes.lines.length, height));
			useEffect(() => setViewport((current) => Viewport.resize(current, height)), [height]);
			useKeys(Viewport.keys, (move) => setViewport((current) => Viewport.step(current, move)));
			useKeys(close, () => resolve(undefined));
			const lines = views[tab].lines;
			// Without colour the swatches are indistinguishable; the legend would be noise.
			const showLegend = useTheme().color !== "none";
			return (
				<Box flexDirection="column">
					<Tabs.View
						tabs={TABS}
						value={tab}
						onChange={(name) => {
							setTab(name);
							setViewport(Viewport.init(views[name].lines.length, height));
						}}
					/>
					{/* The Simulated tab is not a diff, so it gets its own merge/overwrite legend. */}
					{showLegend ? <DocView doc={tab === "simulated" ? simulatedLegend() : legend()} /> : <Text> </Text>}
					<Viewport.View
						rows={rowsOf(views, tab)}
						state={viewport}
						reserved={RESERVED}
						renderRow={(row, highlighted) => (
							<Box>
								<Text>{highlighted ? <Styled token="accent">›</Styled> : " "}</Text>
								<DocView doc={Doc.line(row._tag === "Item" ? (lines[Number(row.key)] ?? []) : [])} />
							</Box>
						)}
					/>
					<KeyHelp tables={[Viewport.keys, Tabs.keys, close]} />
				</Box>
			);
		};
		return <Preview />;
	};
}
