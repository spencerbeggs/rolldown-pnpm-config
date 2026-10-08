import { TestClock } from "effect/testing";

/**
 * A fixed "now" for release-age tests. `it.effect`'s `TestClock` starts at the
 * epoch, so a test that reads the clock sets it here first with {@link atNow};
 * publish times are written relative to it with {@link isoAgo}.
 */
export const NOW: number = Date.UTC(2026, 5, 1, 12, 0, 0);

/** One day, in milliseconds. */
export const DAY = 86_400_000;

/** The ISO timestamp `msAgo` milliseconds before {@link NOW}. */
export const isoAgo = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

/** Set the test clock to {@link NOW}. */
export const atNow = TestClock.setTime(NOW);
