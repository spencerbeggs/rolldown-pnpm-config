# Glossary

* [base](base.md) - The frozen field→value map a plugin author declared, one of the three values freeze produces for the bundled runtime.
* [divergence](divergence.md) - A classified disagreement between the managed value and the consumer's local value, carrying a kind.
* [enforcement](enforcement.md) - What is done about a divergence — warn routes to a console box by kind, error throws EnforcementError, absent is silent.
* [freeze](freeze.md) - The single build-time step where Effect runs, validating a plugin author's declared config and emitting `{ base, manifest, name }`.
* [interop group](interop-group.md) - The set of interop-marked packages within one catalog, reconciled against each other's peerDependencies — with the ceiling/floor vocabulary that describes the reconciliation.
* [manifest](manifest.md) - The field→{ strategy, enforcement, options? } map freeze produces — not a package manifest or package.json.
* [materialize](materialize.md) - Two related senses — normalizeCatalogs materializing a `<name>:peers` catalog from declared peer values, and the upgrade CLI materializing a missing peer literal into the config source.
* [strategy](strategy.md) - A pure (base, local, ctx) => { merged, divergences } function that only detects divergence — and the unrelated PeerStrategy CLI concept that shares the word.
