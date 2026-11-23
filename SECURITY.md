# Security

Bizzi Mac Cleaner is a local macOS tool. It reads directories you choose to scan and, after confirmation, sends selected items to the **Trash**. It does not collect telemetry and does not require `sudo`. The only network request is an optional update check: on launch it fetches `https://registry.npmjs.org/bizzi-mac-cleaner/latest` (no identifiers sent). Disable it with `BIZZI_NO_UPDATE_CHECK=1` or `"updateCheck": false` in `~/.config/bizzi-mac-cleaner/config.json`.

## What the tool will not do

- Permanently delete user files with `fs.rm` / `rimraf`. The only permanent action is emptying Trash (files already in Trash).
- Trash anything that does not match the shape its scanner is allowed to produce (a per-category allowlist is enforced at delete time), or any file inside a macOS package such as a Photos library or `.app` bundle.
- Trash the scan root, git internals, app config, system paths, or secrets (`.ssh`, `.gnupg`, `.aws`, `.kube`, Keychains).
- Follow a symlink out of the scan root or into a protected path.
- Scan `/`, `/Users`, or other system trees. Default scan root is `$HOME`.

## Reporting a vulnerability

Please **do not** open a public issue for a vulnerability that could cause data loss or unexpected deletion.

1. Use GitHub **private vulnerability reporting** on [MiguelBizzi/bizzi-mac-cleaner](https://github.com/MiguelBizzi/bizzi-mac-cleaner/security/advisories/new), or
2. Open a discussion with the maintainer on the [public repository](https://github.com/MiguelBizzi/bizzi-mac-cleaner).

Include: affected version, steps to reproduce, and what you expected instead. We will acknowledge within a few days and ship a fix before any write-up.

## Verifying a release

- Install from npm (`npm i -g bizzi-mac-cleaner`). Releases are published from CI with npm provenance.
- Compare the published tarball to the GitHub tag: `npm pack` locally from that tag should match.
