import { Box, Text, useApp, useInput } from "ink";
import type { ReactElement } from "react";
import { createElement, useEffect, useState } from "react";
import type { WalkState } from "../walk-reducer.js";
import { initWalk, walkStep } from "../walk-reducer.js";
import type { Decision, WalkItem } from "../walk-types.js";

interface WalkProps {
	readonly items: readonly WalkItem[];
	readonly onDone: (decisions: readonly Decision[]) => void;
}

/**
 * Interactive per-package upgrade selector rendered with Ink.
 *
 * Written with React.createElement (no JSX) so the file can be plain .ts
 * without requiring TSX transform configuration.
 *
 * @internal
 */
export function Walk({ items, onDone }: WalkProps): ReactElement {
	const app = useApp();
	const [state, setState] = useState<WalkState>(() => initWalk(items));

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect — initial state is captured once and items are stable for the component's lifetime
	useEffect(() => {
		if (state.done) {
			onDone(state.decisions);
			app.exit();
		}
	}, []);

	useInput((_input, key) => {
		if (state.done) return;
		const which = key.upArrow ? "up" : key.downArrow ? "down" : key.return ? "enter" : null;
		if (!which) return;
		const next = walkStep(state, items, which);
		setState(next);
		if (next.done) {
			onDone(next.decisions);
			app.exit();
		}
	});

	if (state.done || state.index >= items.length) {
		return createElement(Text, null, "Done.");
	}

	const item = items[state.index];
	const e = item.entry;

	const headerText = [
		`${e.catalog} › ${e.pkg}   current ${e.currentRange}`,
		e.peer ? `   peer ${e.peer.value}` : "",
		e.strategy ? `   strategy: ${e.strategy}` : "",
	].join("");

	const header = createElement(Text, null, headerText);

	const candidateRows = item.candidates.map((c, i) => {
		const label = c.kind === "keep" ? `keep ${c.range}` : `${c.range}   ${c.kind}${c.isMajor ? "  ⚠ major" : ""}`;

		const cursor = i === state.cursor ? "❯ " : "  ";
		// Omit `color` entirely when not selected: exactOptionalPropertyTypes
		// forbids passing `undefined` to Ink's optional `color` prop.
		const colorProps = i === state.cursor ? ({ color: "cyan" } as const) : {};

		return createElement(Text, { key: c.kind, ...colorProps }, `${cursor}${label}`);
	});

	return createElement(Box, { flexDirection: "column" }, header, ...candidateRows);
}
