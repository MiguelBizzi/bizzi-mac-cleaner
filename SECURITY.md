# Security

Bizzi Mac Cleaner is a local macOS tool. It reads directories you choose to scan and, after confirmation, sends selected items to the **Trash**. It does not collect telemetry and does not require `sudo`. The only network request is an optional update check: on launch it fetches `https://registry.npmjs.org/bizzi-mac-cleaner/latest` (no identifiers sent). Disable it with `BIZZI_NO_UPDATE_CHECK=1` or `"updateCheck": false` in `~/.config/bizzi-mac-cleaner/config.json`.

## What the tool will not do

- Permanently delete user files with `fs.rm` / `rimraf`. The only permanent action is emptying Trash (files already in Trash).
- Trash anything that does not match the shape its scanner is allowed to produce (a per-category allowlist is enforced at delete time), or any file inside a macOS package such as a Photos library or `.app` bundle.
- Trash the scan root, git internals, app config, system paths, or secrets (`.ssh`, `.gnupg`, `.aws`, `.kube`, Keychains).
- Trash anything on the System Data never list (cloud storage, account and sync state, personal data and settings, app group containers, VM and model store internals, container folders, macOS system files). The never rule is checked at delete time for every cleanup category and beats every allow rule.
- Execute an advisory's command. Advisories (for example a Docker or Ollama cleanup) are shown with their size and the official command as text; the item cannot be selected or deleted.
- Use `sudo` or ask for administrator rights. System Data deletes go to the Trash through the same `deleteSafely()` path as everything else.
- Delete a System Data item without re-checking it first: just before the move it is verified to still exist, to be unchanged since the scan and, where the catalog defines a check, not to belong to a running app. If the running state cannot be determined, it is refused.
- Shell out by name. The few system tools it uses to read macOS state (`/usr/bin/sw_vers`, `/usr/bin/tmutil`, `/usr/bin/plutil`, `/usr/bin/xcrun`, `/usr/bin/lsappinfo`, `/bin/ps`, `/usr/bin/getconf`) are invoked by absolute path so a modified `$PATH` cannot substitute them, and all of them except `sw_vers` run only when scanning your real home directory.
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
