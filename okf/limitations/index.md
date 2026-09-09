# Limitation

* [A non-public localPatchesDir can dangle](local-patches-dir-outside-public.md) - When local.localPatchesDir points outside public/, the distributed patch path the export pipeline writes will not actually exist in a consumer's install.
* [A prerelease workspace next version cannot be planned](prerelease-workspace-next-version.md) - plan's stable-only candidate filter drops a workspace-sourced entry whose next workspace version is a prerelease, unless the entry's current range is itself a prerelease on the same track.
