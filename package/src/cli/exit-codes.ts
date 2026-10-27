/**
 * Exit codes by failure tag, handed to `CliRuntime.main`'s `exitCodes`. A
 * typed failure whose `_tag` is a key here exits with that code; every other
 * failure falls back to 1. The kit owns the remaining codes: a parse-time
 * usage error is 64 (`usageExitCode`) and a cancelled screen is 130.
 *
 * `UpgradeUsageError` is the command's own invalid flag combination (`--format
 * json` outside `--check`/`--yes`/`--dry-run`), so it shares the parser's 64
 * (BSD `EX_USAGE`) rather than a resolution failure's 1.
 *
 * @internal
 */
export const EXIT_CODES: Readonly<Record<string, number>> = {
	UpgradeUsageError: 64,
};
