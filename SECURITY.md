# Security

Bizzi Mac Cleaner is a local macOS tool. It reads directories you choose to scan and, after confirmation, sends selected items to the **Trash**. It does not collect telemetry, does not phone home, and does not require `sudo`.

## What the tool will not do

- Permanently delete user files with `fs.rm` / `rimraf`. The only permanent action is emptying Trash (files already in Trash).
- Trash the scan root, git internals, app config, system paths, or secrets (`.ssh`, `.gnupg`, `.aws`, `.kube`, Keychains).
- Follow a symlink out of the scan root or into a protected path.
- Scan `/`, `/Users`, or other system trees. Default scan root is `$HOME`.

## Reporting a vulnerability

Please **do not** open a public issue for a vulnerability that could cause data loss or unexpected deletion.

1. Use GitHub **private vulnerability reporting** on [MiguelBizzi/bizzi-mac-cleaner](https://github.com/MiguelBizzi/bizzi-mac-cleaner/security/advisories/new), or
2. Open a discussion with the maintainer on the [public repository](https://github.com/MiguelBizzi/bizzi-mac-cleaner).

Include: affected version, steps to reproduce, and what you expected instead. We will acknowledge within a few days and ship a fix before any write-up.

## Verifying a release

- Install from npm (`npm i -g bizzi-mac-cleaner`) or a Homebrew tap that builds from the same tagged commit.
- Compare the published tarball to the GitHub tag: `npm pack` locally from that tag should match.
- After Homebrew ships: `brew audit --strict bizzi-mac-cleaner` and verify the formula `url` + `sha256`.
