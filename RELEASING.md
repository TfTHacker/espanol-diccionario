# Releasing Español Diccionario

This document is the source of truth for versioning and release automation.

## Release workflow

Workflow file:
- `.github/workflows/release.yml`

Triggers:
- automatic on pushed tags matching `*.*.*`
- manual via `workflow_dispatch` with required input `tag`

The workflow:
1. checks out the repo
2. installs dependencies with `npm ci`
3. runs `npm run typecheck`
4. runs `npm run build`
5. downloads `dictionary.db` from the latest GitHub release asset URL
6. packages release assets
7. creates or updates the GitHub release for the tag

## Release assets

Each GitHub release should include:
- `main.js`
- `manifest.json`
- `styles.css`
- `sql-wasm.wasm`
- `dictionary.db`

Notes:
- `main.js` is a generated build artifact and should not be committed to the repository.
- The release workflow builds `main.js` in CI and uploads it as a release asset.

## Normal release process

1. Make and commit code changes.
2. Bump the version.
3. Push `main`.
4. Create and push a semver tag.
5. GitHub Actions publishes or updates the release.

Typical commands:

```bash
npm version patch
sudo -u kunicki env HOME=/home/kunicki git push origin main
sudo -u kunicki env HOME=/home/kunicki git push origin <new-version-tag>
```

Notes:
- `npm version patch|minor|major` updates `package.json` and `package-lock.json`, then runs the `version` script from `package.json`.
- The repo also keeps `manifest.json` and `versions.json` aligned with the package version during the version script.
- The `postversion` script converts npm's default `vX.Y.Z` tag into the plain `X.Y.Z` tag expected by this repo's release workflow and existing release history.
- Push GitHub changes as `kunicki`, because root does not have the GitHub auth used for this repo.

## Manual release / recovery

Use manual dispatch when:
- the tag already existed before the workflow was added
- a release job failed and needs rerun
- you want to re-publish assets for an existing tag

Using GitHub UI:
- Actions → `Release Obsidian plugin` → `Run workflow`
- provide `tag`, e.g. `0.1.1`

Using GitHub CLI:

```bash
gh workflow run "Release Obsidian plugin" -f tag=0.1.1
```

## Important GitHub Actions caveat

For tag-triggered runs, GitHub evaluates the workflow from the commit the tag points to.

That means:
- if a tag points to a commit from before `.github/workflows/release.yml` existed, no automatic workflow will run
- in that case, use `workflow_dispatch`

## dictionary.db bootstrap behavior

`dictionary.db` is ignored by git and is not present in CI by default.

The release workflow downloads it from:

- `https://github.com/TfTHacker/espanol-diccionario/releases/latest/download/dictionary.db`

This means release automation depends on the latest release already containing `dictionary.db`.

### First-time bootstrap

If the latest release does not yet contain `dictionary.db`, the workflow will fail in the download step.

Bootstrap by manually uploading the local database to an existing release:

```bash
gh release upload <tag> data/dictionary.db --clobber
```

Then rerun the workflow manually:

```bash
gh workflow run "Release Obsidian plugin" -f tag=<tag>
```

After that, future releases can download `dictionary.db` from the latest release automatically.

## Verifying a release

Check workflow runs:

```bash
gh run list --workflow "Release Obsidian plugin" --limit 5
```

Check a release:

```bash
gh release view <tag> --json tagName,name,assets,url
```

## Current known details

- Current release workflow supports both auto tag releases and manual reruns.
- `dictionary.db` was bootstrapped into release `0.1.1` manually, after which automated reuse became possible.
- GitHub may show a warning about some Actions targeting Node 20 internally (`actions/checkout@v4`, `actions/setup-node@v4`). The workflow already mitigates this by forcing JavaScript actions onto Node 24 and running build steps on Node 24. The remaining warning is informational until upstream action versions officially target Node 24.
