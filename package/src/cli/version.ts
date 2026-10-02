/**
 * The CLI's version. The bundler substitutes `__PACKAGE_VERSION__` at build
 * time, so this is not a runtime environment read; source runs report
 * `0.0.0`.
 *
 * @internal
 */
export const CLI_VERSION: string = process.env.__PACKAGE_VERSION__ ?? "0.0.0";
