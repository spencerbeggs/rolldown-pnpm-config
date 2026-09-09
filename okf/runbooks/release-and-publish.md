---
type: Runbook
title: Release and publish
description: The changeset-driven flow that versions `package/` and publishes it to the npm registry.
resource: ../../.github/workflows/release.yml
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: release-workflow
    resource: ../../.github/workflows/release.yml
  - id: changeset-config
    resource: ../../.changeset/config.json
  - id: package-package-json
    resource: ../../package/package.json
  - id: targets-json
    resource: ../../package/dist/prod/targets.json
  - id: root-claude-md
    resource: ../../CLAUDE.md
tags:
  - release
---

# Release and publish

## Trigger

A push to `main`, a pull request against `main` or
`changeset-release/main`, or a manual `workflow_dispatch` (with an optional
`dry_run` input).[^release-workflow]

## Procedure

1. The `Silk` workflow (`.github/workflows/release.yml`) delegates the
   entire flow to a reusable workflow,
   `spencerbeggs/.github/.github/workflows/release.yml@main`, granting it
   `contents: write`, `pull-requests: write`, `id-token: write`,
   `packages: write`, `attestations: write`, `checks: write`, and
   `artifact-metadata: write`.[^release-workflow] The reusable workflow —
   not this repo — owns the changeset → version → publish steps; this repo
   only supplies the trigger, permissions, and inputs
   (`dry-run`, `auto-merge: "squash"`, `skip-claude-review: false`).[^release-workflow]
2. Changesets accumulate in `.changeset/` per the pending-changeset
   convention; `.changeset/config.json` sets `access: "restricted"` at the
   config level, `commit: false`, and routes changelog generation through
   `@savvy-web/changesets`' `@savvy-web/changelog` against
   `spencerbeggs/rolldown-pnpm-config`.[^changeset-config]
3. The reusable workflow, via `savvy-web/silk-release-action`, versions the
   package and publishes the `dist/prod/npm/` build output to the publish
   target(s) declared in `package/package.json`'s `publishConfig.targets`,
   with provenance attestation — the `id-token: write` and
   `attestations: write` permissions above exist for
   this.[^release-workflow][^package-package-json]

## Current pre-publish state

`package/package.json` is still `"private": true` in source — this is
intentional (see the never-unset-private-in-source convention) and does
not block publishing: the build transform sets `private: false` only on
the emitted `dist/prod/npm/pkg/package.json`, which is what actually
ships.[^package-package-json]

## Currently configured target

`package/package.json`'s `publishConfig.targets` declares only `{ npm:
true }`, and the resolved `package/dist/prod/targets.json` shows a single
target, `registry: "https://registry.npmjs.org"` — there is no
GitHub-Packages target declared or resolved.[^package-package-json][^targets-json]
The root `CLAUDE.md`'s "Publish Targets" section names only the npm
registry as the publish destination, matching this
state.[^root-claude-md]

## Success

A new version of `rolldown-pnpm-config` is published to
`registry.npmjs.org` with provenance attestation, and the pending
`.changeset/*.md` files are consumed (versioned into
`package/CHANGELOG.md` and removed).

[^release-workflow]: release-workflow
[^changeset-config]: changeset-config
[^package-package-json]: package-package-json
[^targets-json]: targets-json
[^root-claude-md]: root-claude-md
