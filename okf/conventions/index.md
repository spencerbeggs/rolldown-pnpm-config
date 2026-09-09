# Convention

* [Add a managed field through the descriptor table only](adding-a-managed-field.md) - A new managed pnpm field is one descriptor entry plus its matching PluginConfig line; never hand-list a field anywhere else.
* [Commit message format](commit-format.md) - Every commit needs a conventional-commit type and a DCO Signed-off-by trailer, enforced by the commit-msg hook via @savvy-web/commitlint.
* [Import and module style](import-and-module-style.md) - The enforced relative-import extension, node: protocol, import-type, and no-unused/no-cycle rules, plus the strict TypeScript flags that turn violations into compile errors, and the counter-rule against hand-formatting.
* [Keep the managed-fields interface in step with the descriptor table](keep-the-coverage-matrix-in-step.md) - Update okf/interfaces/managed-pnpm-fields.md whenever the descriptor table changes; treat pnpm.io/settings, not schemastore, as authoritative.
* [Keep virtual.d.ts self-contained](virtual-dts-stays-self-contained.md) - Never write a cross-module import inside package/src/virtual.d.ts; inline the types it needs and hand-sync them with the runtime source.
* [Never set private to false in the source package.json](never-unset-private-in-source.md) - package/package.json must stay "private" true; @savvy-web/bundler's built-in package.json transform flips it only in the built output.
* [Test file layout](test-layout.md) - Tests live in package/__test__/, never co-located in src/; classification is by filename suffix, and utils/fixtures are per-category and excluded from discovery.
