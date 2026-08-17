---
"rolldown-pnpm-config": minor
---

## Breaking Changes

### Legacy camelCase peers-catalog alias removed

`normalizeCatalogs` now emits a peers catalog only under the colon-delimited name `<name>:peers`. The legacy camelCase alias `<name>Peers` — previously emitted alongside it for backward compatibility — is no longer generated.

If a consuming repo's `pnpm-workspace.yaml` or manifests still reference `catalog:<name>Peers`, update those references to `catalog:<name>:peers`:

```yaml
# before
dependencies:
  react: "catalog:silkPeers"

# after
dependencies:
  react: "catalog:silk:peers"
```

Any dependency still pinned to the camelCase catalog name will fail to resolve once this version is installed.
