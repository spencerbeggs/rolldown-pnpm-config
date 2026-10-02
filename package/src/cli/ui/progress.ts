/**
 * What the resolve phase reports while it works: a phase starting (with its
 * total, when it has one), units of it done, and the phase finishing with the
 * label its committed line keeps. Each phase is one run of the live view.
 *
 * @internal
 */
export type ProgressEvent =
	| { readonly _tag: "Phase"; readonly label: string; readonly total: number }
	| { readonly _tag: "Step"; readonly done: number }
	| { readonly _tag: "Finished"; readonly label: string };

/** The live view's state: the current phase and how far into it the run is. @internal */
export interface ProgressState {
	readonly label: string;
	readonly done: number;
	readonly total: number;
	readonly finished: boolean;
}

/** The progress fold, kept free of React so it is tested without a terminal. @internal */
export function reduceProgress(state: ProgressState, event: ProgressEvent): ProgressState {
	switch (event._tag) {
		case "Phase":
			return { label: event.label, done: 0, total: event.total, finished: false };
		case "Step":
			return { ...state, done: event.done };
		case "Finished":
			return { ...state, label: event.label, finished: true };
	}
}

/** The state before any phase begins. @internal */
export const initialProgress: ProgressState = { label: "", done: 0, total: 0, finished: false };
