# Distributing dependency patches

A plugin author can ship pnpm dependency patches through the config-dependency plugin itself. You author a `.patch` file with stock pnpm, drop it in a conventional folder and the build bakes the registration into the emitted pnpmfile. Every consuming repo then applies the patch automatically through `updateConfig` — no consumer ever hand-writes a `patchedDependencies` entry. That auto-injection is the advantage over wiring patches into vanilla pnpm config dependencies by hand.

## The two folders

The plugin looks for patches in two folders resolved next to the file that constructs `PnpmConfigPlugin`:

| Folder | Shipped to consumers | Rewritten into the pnpmfile |
| ------ | -------------------- | --------------------------- |
| `public/patches/` | Yes — the bundler copies `public/` into the published package | Yes |
| `patches/` | No — pnpm's default `patchesDir`, local to your repo | No |

Use `public/patches/` for patches you want every consumer to receive. Use `patches/` for patches that stay in your own repo and never travel with the plugin.

## Authoring a patch

Author the patch with stock pnpm. The only addition is directing pnpm to write the `.patch` into `public/patches/` so the bundler ships it. Point `--patches-dir` (or the `patchesDir` setting) at `public/patches`:

```bash
# 1. open the package for editing — pnpm prints a temporary edit directory
pnpm patch react@19.2.7
# ... edit the files in the printed directory ...

# 2. commit the edit into the distributed folder
pnpm patch-commit <edit-dir> --patches-dir public/patches
# writes public/patches/react@19.2.7.patch
```

The filename is pnpm's own convention: the package key with `/` mangled to `__` (`@scope/pkg@1.0.0` becomes `@scope__pkg@1.0.0.patch`). The plugin reverses that mangling to recover the `patchedDependencies` key, so you never name the key yourself.

## What the build does

At build the plugin discovers every `.patch` in `public/patches/`, derives its key and rewrites the path to the location the file resolves to inside a consumer's `node_modules`. It bakes the result into the emitted pnpmfile's `patchedDependencies`. When pnpm installs in a consuming repo, the `updateConfig` hook merges that map in:

```yaml
# what every consumer receives, injected by updateConfig — nobody writes this by hand:
patchedDependencies:
  react@19.2.7: node_modules/.pnpm-config/@acme/pnpm-config/patches/react@19.2.7.patch
```

The `@acme/pnpm-config` segment is the plugin's `name`. Each plugin owns only the patches under its own folders, so several config dependencies and a repo's own `patches/` entries coexist without clobbering each other.

## Your own repo

The distributed `.pnpm-config` path is for consumers, not for the repo that authors the plugin. When you run `rolldown-pnpm-config export`, the command writes the patch entries into your own `pnpm-workspace.yaml` with their local on-disk paths instead:

```bash
npx rolldown-pnpm-config export
# Exported to /path/to/pnpm-workspace.yaml
```

```yaml
# in your own pnpm-workspace.yaml — local path, sibling entries preserved:
patchedDependencies:
  react@19.2.7: public/patches/react@19.2.7.patch
```

The entries are merged by key, so patches owned by other plugins and any patch you registered by hand survive the rewrite. Your install uses the local path while consumers of the published plugin use the `.pnpm-config` path — the same patch, resolved correctly on both sides.

`export` also checks each entry against disk and prints a warning to stderr when a registered patch has no file (`warning: patch entry "<key>" has no file on disk`) or when its key does not derive from its filename. Run `rolldown-pnpm-config preview` to inspect the full set of entries before writing.

## Authoring directives

Patches are driven by the existing `patchedDependencies` field and the `local` block, not a new top-level option:

```ts
export const plugin = {
  name: "@acme/pnpm-config",
  // default when public/patches/ has files; a bare map is the full-manual escape hatch
  patchedDependencies: { strategy: "rewrite" },
  local: {
    // default: upsert this plugin's patch keys with local paths, preserve every other key
    patchedDependencies: { strategy: "merge" },
    // optional: override the distributed source root (default public/patches/)
    localPatchesDir: "public/vendor-patches",
  },
} satisfies PluginConfig;
```

`patchedDependencies: { strategy: "rewrite" }` is the default behavior once `public/patches/` contains files, so most authors leave both directives off and let discovery run. Set an explicit map when you want to register a patch path by hand and skip discovery entirely.

## Requirements and caveats

- The patch file has to live inside the published package. The bundler copies `public/` into the package, so a patch under `public/patches/` ships and a patch under `patches/` never does.
- `local.localPatchesDir` is meant to point at a subfolder of `public/`. A path outside `public/` is not copied into the package, so the rewritten consumer path would point at a file that is not there.
- Consumers apply the patch through the same emitted pnpmfile that carries every other managed setting, so they need the same pnpm version that loads the pnpmfile. See [getting started](./01-getting-started.md).
- Collisions between two plugins that patch the same package are yours to inspect with `preview`. The engine does not warn about them.

## Related pages

- [Getting started](./01-getting-started.md) — author the config and run the plugin build.
- [Concepts](./03-concepts.md) — the config-dependency and `updateConfig` model patches ride on.
- [Exporting to pnpm-workspace.yaml](./06-exporting.md) — the `export` and `preview` commands and the `local` merge directives.
