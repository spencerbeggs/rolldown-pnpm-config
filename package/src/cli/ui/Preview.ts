import { Box, Text, useApp, useInput } from "ink";
import { Tab, Tabs } from "ink-tab";
import type { FC, ReactElement } from "react";
import { createElement, useState } from "react";
import type { StyledLine } from "./styled.js";

interface PreviewViews {
	readonly changes: readonly StyledLine[];
	readonly full: readonly StyledLine[];
	readonly simulated: readonly StyledLine[];
}

const INK_COLOR: Record<string, string | undefined> = {
	added: "green",
	removed: "red",
	changed: "yellow",
	warn: "red",
	local: "magenta",
	unmanaged: "gray",
	unchanged: "gray",
	plain: undefined,
};

// ink-tab declares `children` as a required prop in TabProps / TabsProps, but
// React.createElement injects it at runtime from rest arguments.  Cast the
// component types to variants that do not require `children` in the props
// object so we can use the canonical rest-arg pattern without triggering
// lint/correctness/noChildrenProp.  The `as unknown as` two-step cast avoids
// lint/suspicious/noExplicitAny.
type TabEl = FC<{ name: string; key: string }>;
type TabsEl = FC<{ onChange: (name: string) => void }>;
const TabC = Tab as unknown as TabEl;
const TabsC = Tabs as unknown as TabsEl;

function renderLines(lines: readonly StyledLine[]): ReactElement {
	return createElement(
		Box,
		{ flexDirection: "column" },
		...lines.map((l, i) => {
			const indent = "  ".repeat(l.indent);
			const tag = l.tag ? `  (${l.tag})` : "";
			const body = l.segments.map((s, j) => {
				const color = INK_COLOR[s.style];
				return createElement(Text, { key: j, ...(color ? { color } : {}) }, s.text);
			});
			return createElement(Text, { key: i }, `${l.gutter} ${indent}`, ...body, tag);
		}),
	);
}

/**
 * Interactive export preview: an ink-tab bar over the Changes / Full /
 * Simulated views. `q`/Esc exits. Written with React.createElement (no JSX).
 *
 * @internal
 */
export function Preview({ views, onExit }: { views: PreviewViews; onExit: () => void }): ReactElement {
	const app = useApp();
	const [active, setActive] = useState<keyof PreviewViews>("changes");

	useInput((input, key) => {
		if (input === "q" || key.escape) {
			onExit();
			app.exit();
		}
	});

	const tabs = createElement(
		TabsC,
		{ onChange: (name: string) => setActive(name as keyof PreviewViews) },
		createElement(TabC, { name: "changes", key: "changes" }, "Changes"),
		createElement(TabC, { name: "full", key: "full" }, "Full"),
		createElement(TabC, { name: "simulated", key: "simulated" }, "Simulated"),
	);

	return createElement(Box, { flexDirection: "column" }, tabs, renderLines(views[active]));
}
