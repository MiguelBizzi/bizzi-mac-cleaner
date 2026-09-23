# Deploy Bizzi Mac Cleaner

Public install path: the npm registry. Anyone on macOS with Node.js 20 or newer installs it with `npm` or `npx`. No Apple Developer account, notarization, or Mac App Store listing is required. `npm i -g` installs a Node script; Gatekeeper does not review it.

An Apple Developer membership ($99/year), a Developer ID certificate, and notarization matter only if you later ship a signed standalone binary, a `.app`, or a Mac App Store build. Do not ship `nexe` or `pkg` until that pipeline exists. An unsigned Mach-O is a worse trust story than npm.

This document is the maintainer guide. User install steps live in [README.md](./README.md).

## Audit

### Ready

- Local Ink TUI. No telemetry, no phone-home, no `sudo`.
- User deletes go through the [`trash`](https://www.npmjs.com/package/trash) package after a TUI confirm. They are recoverable from the Trash.
- Emptying `~/.Trash` is the only permanent action. The user must type `empty`. A real empty uses Finder (`osascript`), so Terminal needs Automation permission to control Finder.
- [`src/core/deleteSafely.ts`](src/core/deleteSafely.ts) is the only delete entry point. It refuses the scan root, the home directory itself, anything outside the resolved root (including symlink targets), `.git`, `~/.config/bizzi-mac-cleaner`, system trees, and secrets (`.ssh`, `.gnupg`, `.aws`, `.kube`, Keychains). See [`src/core/paths.ts`](src/core/paths.ts).
- Docker cleanup does not call `docker system prune`.
- [`package.json`](package.json) `bin` points at `dist/cli.js`. [`src/cli.ts`](src/cli.ts) has the `#!/usr/bin/env node` shebang, which `tsc` keeps.
- `files` publishes `dist`, `README.md`, `LICENSE`, and `SECURITY.md` only.
- `engines.node` is `>=20`. `publishConfig.access` is `public`.
- `prepublishOnly` runs tests and `tsc`. `dist/` is gitignored, so `npm publish` rebuilds from source. Do not copy a local `dist/` into a tarball by hand. A stale local build can omit the `isSafeScanRoot` check that `src/cli.ts` has.
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `npm ci`, `npm audit --omit=dev`, tests, and build on `macos-latest` with Node 20.
- Releases ([`.github/workflows/release.yml`](.github/workflows/release.yml)) publish on a `v*` tag with `--provenance`.

### Still yours before the first tag

- Confirm [`package.json`](package.json) still points at [MiguelBizzi/bizzi-mac-cleaner](https://github.com/MiguelBizzi/bizzi-mac-cleaner). Enable GitHub private vulnerability reporting on that repo ([SECURITY.md](./SECURITY.md) already links to it).
- Confirm the npm name is free (`npm view bizzi-mac-cleaner`). The first publisher owns `bizzi-mac-cleaner`.
- Create the npm account (2FA on) and the `NPM_TOKEN` secret described below. This guide does not publish for you.
- Have a backup story for your own first live run (Time Machine or equivalent). The published CLI defaults to live mode: confirmed items go to the Trash. First-run docs and your own smoke test must use `--dry-run`.

### What users must have

- macOS. Other platforms exit immediately.
- Node.js 20 or newer. npm only warns on `engines` unless the user sets `engine-strict=true`.
- A real terminal (Terminal, iTerm, Ghostty, and so on). Ink owns the TTY; piping stdout does not work.
- Full Disk Access for that terminal app if a scan of `~/Library` is denied.
- Automation permission (Terminal controlling Finder) only if they empty the Trash.

## First publish

Do this once, from a clean `main` that CI has already passed.

### 1. npm account

1. Create an account at [npmjs.com](https://www.npmjs.com/signup).
2. Turn on two-factor authentication.
3. `npm login` on the machine you trust for a fallback local publish.

### 2. Point the package at the public repo

[`package.json`](package.json) already points at [MiguelBizzi/bizzi-mac-cleaner](https://github.com/MiguelBizzi/bizzi-mac-cleaner):

```json
"author": "Bizzi Tech LTDA",
"repository": {
  "type": "git",
  "url": "git+https://github.com/MiguelBizzi/bizzi-mac-cleaner.git"
},
"homepage": "https://github.com/MiguelBizzi/bizzi-mac-cleaner#readme",
"bugs": {
  "url": "https://github.com/MiguelBizzi/bizzi-mac-cleaner/issues"
}
```

[SECURITY.md](./SECURITY.md) links to private vulnerability reporting on that repo. Enable it under the repo **Security** settings before you tag.

### 3. Claim the name

```bash
npm view bizzi-mac-cleaner
```

`404` means the name is free. If a version is returned, stop and pick another name. Do not publish over a package you do not own.

### 4. Check the tarball

```bash
npm ci
npm run audit:prod
npm test
npm run build
npm pack --dry-run
```

The dry-run listing must include `dist/cli.js`, `dist/locales/en.json`, `dist/locales/pt.json`, `README.md`, `LICENSE`, and `SECURITY.md`. It must not include `src/`, tests, or `node_modules/`.

### 5. Token for GitHub Actions

npm will not accept a second publish of the same version, and provenance only attaches when the publish runs from this public GitHub Actions workflow.

1. npm → **Access Tokens** → **Generate New Token** → **Granular Access Token**.
2. Allowed IP ranges: leave empty unless you restrict GitHub later.
3. Packages and scopes: **Read and write**. For the first release, include permission to publish new packages (the name does not exist yet). After 0.1.0 exists you can narrow the token to `bizzi-mac-cleaner` only.
4. Expiration: 90 days or less. Rotate it. Never commit the value.
5. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name: `NPM_TOKEN`. Value: the token.

The workflow reads `secrets.NPM_TOKEN`. It does not store the token in the repo.

After the package exists you can switch to [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no long-lived token):

1. npm package → **Settings** → **Trusted Publisher** → GitHub Actions.
2. Organization/user, repo `bizzi-mac-cleaner`, workflow file `release.yml`.
3. Remove the `NODE_AUTH_TOKEN` line from [`.github/workflows/release.yml`](.github/workflows/release.yml). Keep `permissions: id-token: write`.

The first publish cannot use trusted publishing, because the package settings page does not exist until something is published.

### 6. Tag and publish

`version` in `package.json` is `0.1.0`. The tag must be `v0.1.0`. The workflow refuses a tag that does not match.

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```

That push runs **Release**. It checks the tag, runs `npm ci`, `npm audit --omit=dev`, tests, and `tsc`, then `npm publish --provenance --access public`. `prepublishOnly` tests and builds again inside `npm publish`. Watch the Actions log until the publish step succeeds.

If you must publish once from a laptop instead (no Actions yet):

```bash
npm login
npm publish --access public
```

A local publish has no provenance attestation. Prefer the tag workflow.

### 7. Prove a stranger can install it

On a second Mac, or a clean terminal that is not this repo:

```bash
node -v   # v20 or higher
npm i -g bizzi-mac-cleaner
bizzi-mac-cleaner --dry-run
```

Confirm the header says **DRY-RUN**, the menu opens, and nothing moves to the Trash. Then:

```bash
npm view bizzi-mac-cleaner version
npm view bizzi-mac-cleaner dist.integrity
```

On the npm package page, check that the repository link resolves and that the version shows a provenance badge.

## Later releases

There is no in-app updater and no Apple push channel. Shipping an update checker would make the tool contact the network, which [SECURITY.md](./SECURITY.md) says it does not do. The registry is the update channel.

### Maintainer

1. Choose the version: `0.1.1` patch, `0.2.0` feature, `1.0.0` breaking.
2. Set that `version` in [`package.json`](package.json) and commit it on `main`.
3. Tag `v` plus the same version and push the tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

4. The release workflow publishes that exact version. npm rejects a republish of a version that already exists. A bad release is fixed by publishing the next version, not by overwriting.

### Users

Global install:

```bash
npm update -g bizzi-mac-cleaner
```

One-off, current release:

```bash
npx bizzi-mac-cleaner@latest --dry-run
```

A bare `npx bizzi-mac-cleaner` can reuse a cached copy. Tell people to use `@latest` when you announce a fix.

## User-facing requirements to repeat in announcements

- macOS, Node.js 20+, interactive terminal.
- First command is `bizzi-mac-cleaner --dry-run`. Live mode is the default when `BIZZI_DRY_RUN` is unset. `--no-dry-run` only overrides that variable. Every delete still needs a TUI confirmation. Emptying Trash is permanent.
- Full Disk Access if Library scans are blocked. Automation permission only for emptying Trash.
- Update with `npm update -g bizzi-mac-cleaner`.
