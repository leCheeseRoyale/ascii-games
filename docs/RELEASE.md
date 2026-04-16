# Release Guide

How to cut a new `create-ascii-game` release. Versions apply to the CLI package only — the engine itself is not published (root `package.json` is `private`).

## Steps

1. **Verify `main` is green.** Check the latest CI run on GitHub — `check`, `test`, `lint`, `build`, `export` must all pass.
2. **Update `CHANGELOG.md`.** Move entries under `## [Unreleased]` to a new `## [X.Y.Z] - YYYY-MM-DD` section. Keep `## [Unreleased]` as an empty header for future work.
3. **Bump the CLI version** in `packages/create-ascii-game/package.json` to `X.Y.Z`.
4. **Commit:**

   ```bash
   git add CHANGELOG.md packages/create-ascii-game/package.json
   git commit -m "chore: release vX.Y.Z"
   ```

5. **Tag and push:**

   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```

6. **Watch `release.yml`** on GitHub Actions. It will:
   - Run the full gate (`check` + `test` + `lint` + `build` + `export`)
   - `npm publish --access public --provenance` from `packages/create-ascii-game/`
   - Create a GitHub Release from the tag with `CHANGELOG.md` body + auto-generated commit notes

## Rollback

- **Within 72 hours of publish:** `npm unpublish create-ascii-game@X.Y.Z`. Note: npm disallows re-publishing the same version for 24h after unpublish.
- **After 72 hours:** `npm deprecate create-ascii-game@X.Y.Z "reason"`, then publish a fixed `X.Y.Z+1`.
- Delete the GitHub Release and tag if you need to re-tag:

  ```bash
  git push --delete origin vX.Y.Z
  git tag -d vX.Y.Z
  ```

## Required secrets

Set on the GitHub repo under **Settings → Secrets and variables → Actions**:

- `NPM_TOKEN` — an npm **automation** token with publish rights for the `create-ascii-game` package. Create at <https://www.npmjs.com/settings/~/tokens>.

Provenance (`--provenance`) is provided by GitHub's OIDC token — the workflow already grants `id-token: write`, no extra secret needed.
