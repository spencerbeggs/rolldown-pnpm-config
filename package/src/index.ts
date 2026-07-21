export type { CatalogDeclaration, CatalogPackageSpec, PeerStrategy } from "./catalogs.js";
export type { FieldInput, LocalDirective, PluginConfig } from "./define-plugin.js";
export type { AllowedVersionsFromCatalogs } from "./plugin/allowed-versions.js";
export { PnpmConfigPlugin } from "./plugin/index.js";
// `Enforcement` is reachable from the public `FieldInput`; export it from the
// main entry so API Extractor sees it (the runtime entry re-exports it too).
export type { Enforcement } from "./runtime/types.js";
