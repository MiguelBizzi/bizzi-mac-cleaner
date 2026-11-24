# Bizzi Mac Cleaner

Interactive terminal UI (macOS) that finds developer caches, stale `node_modules`, and large files, then sends them to the **Trash** so they stay recoverable.

Requires **macOS** and **Node.js 20+**. Other platforms exit with a friendly message. No Apple Developer account is required.

Install Node.js 20 or newer if `node -v` is older or missing. Homebrew: `brew install node@20`. Or use the 20 LTS (or newer) installer from [nodejs.org](https://nodejs.org).

```bash
npm i -g bizzi-mac-cleaner
bizzi-mac-cleaner --dry-run
```

One-off, without a global install:

```bash
npx bizzi-mac-cleaner@latest --dry-run
```

**Preview-first:** until you opt in to live mode once with `--no-dry-run`, nothing is ever moved — the app runs as a preview. In live mode, confirmed items go to the Trash (recoverable); space is only reclaimed after you empty the Trash.

Update a global install later with `npm update -g bizzi-mac-cleaner`. A bare `npx bizzi-mac-cleaner` can reuse a cached copy; use `@latest` when you want the current release.

### macOS permissions

- Run it in a real terminal (Terminal, iTerm, Ghostty, and so on). The interface needs a TTY.
- If a scan of `~/Library` is denied, grant Full Disk Access: System Settings → Privacy & Security → Full Disk Access → enable your terminal app.
- Emptying Trash is permanent and asks Terminal for permission to control Finder (Automation). The tool requires you to type `empty`.

## System Data

macOS Storage settings lumps everything it cannot name into "System Data". Bizzi Mac Cleaner finds the large, regenerable parts of it (app and Apple caches, logs, web data, developer artifacts, AI model caches, old device backups and installers, simulator runtimes, local snapshots), explains each one, and sends only what it can justify to the **Trash**. The header shows your macOS version and whether Full Disk Access is granted.

Every item has exactly one safety level:

- **Safe**: Regenerated automatically; removing it costs at most a rebuild or re-download and never loses user data.
- **Review**: Regenerable, but removal has a visible cost (sign-outs, a multi-GB re-download, lost device symbols, an old backup). Offered, unselected by default, explained.
- **Advisory**: Reclaimable only through macOS or the owning tool. Shown with its size and the official command; never deleted by us.
- **Never**: Deleting it breaks macOS, an app or sync, or destroys user data. Always refused.

Never touched, whatever the cleanup category: cloud storage files; account and sync state; active downloads and open documents; personal data and settings; app group containers; VM and model store internals; container folders; macOS system files. Matching these is a hard refusal that wins over every allow rule.

Deletions go to the Trash, so they are recoverable; disk space is only reclaimed once you empty the Trash. On a macOS newer than the newest version we have verified (27), safe items are offered as review instead.

Details: [expert guide and sources](./docs/system-data/README.md) and the [generated taxonomy](./docs/system-data/TAXONOMY.md) of every location, with its safety level and what regenerates it.

## Usage

```bash
bizzi-mac-cleaner
bizzi-mac-cleaner --root /path/to/scan
bizzi-mac-cleaner --dry-run
bizzi-mac-cleaner --no-dry-run   # force live mode even if BIZZI_DRY_RUN is set
```

| Flag | Meaning |
| --- | --- |
| `--root <path>` | Scan root for every scanner. Default is `$HOME` (or the path saved in Settings). **Never** hard-coded inside scanners. Refuses `/`, `/Users`, and other system paths. |
| `--dry-run` | `deleteSafely()` logs what it would trash and writes `history.json`, but does **not** call `trash()`. |
| `--no-dry-run` | Opt in to live mode (remembered after the first use; overrides `BIZZI_DRY_RUN`). Deletes still need TUI confirmation. |
| `-v, --version` | Print the version. |

`BIZZI_DRY_RUN=1` (or `true` / `yes`) has the same effect as `--dry-run`. `npm run dev` sets it automatically.

### Development

```bash
npm install
npm run fixture          # prints a throwaway directory
npx tsx src/cli.ts --root "$(npm run fixture --silent)" --dry-run
# or:
npm run dev -- --root /path/from/fixture
npm test
npm run test:coverage
npm run build
```

The header shows **LIVE** (confirmed items go to Trash, recoverable) or **DRY-RUN**. Dry-run is opt-in via `--dry-run` or `BIZZI_DRY_RUN=1`. Every delete still requires a TUI confirmation.

## How deletion safety works

- User files are **never** permanently removed with `fs.rm` / `rimraf`. Deletes go through the [`trash`](https://www.npmjs.com/package/trash) package (macOS Trash).
- `deleteSafely()` is the only delete entry point. It refuses:
  - the scan root itself and the user's home directory
  - anything outside the resolved `--root` (including symlink targets, via `realpath`)
  - paths inside `.git`
  - `~/.config/bizzi-mac-cleaner` (app config + history)
  - system trees (`/System`, `/usr`, `/Library`, …)
  - secrets (`.ssh`, `.gnupg`, `.aws`, `.kube`, Keychains)
  - anything that does not match its scanner's category allowlist (e.g. an "npm cache" can only be an npm cache path); largest-file results are never files inside macOS packages (`.photoslibrary`, `.app`, …) or `~/Library`
- Scan root cannot be `/`, `/Users`, or another system path. Settings will ignore an unsafe value.
- Items marked **caution** (largest files, Docker caches, Xcode Archives, Safari HTTPStorages / WebKit, active `node_modules`, …) show an extra warning before confirm.
- Emptying `~/.Trash` is the one inherently permanent action (those files are already in Trash). Confirm by typing `empty` then Enter — `y` is not enough. Dry-run still only logs. A real empty of the user's Trash uses Finder; a fixture `.Trash` still goes through `trash()`.
- Every attempt (including dry-run) is appended to `~/.config/bizzi-mac-cleaner/history.json` (mode `0600`, last 500 entries).

Pressing Ctrl+C mid-delete finishes the item being moved, leaves the rest untouched, and exits cleanly.

The app checks the npm registry for a newer version on launch (nothing else leaves your machine). Disable with `BIZZI_NO_UPDATE_CHECK=1` or `"updateCheck": false` in `config.json`.

Config lives at `~/.config/bizzi-mac-cleaner/config.json` (locale, staleness days, default scan root, confirm-every-delete, largest-files N). The config directory is `0700`.

See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## Fixture generator

`npm run fixture` builds a synthetic tree (fake projects, caches, large files) under a fresh temp directory and **prints the path**. Point the app at it:

```bash
ROOT="$(npm run fixture --silent)"
bizzi-mac-cleaner --root "$ROOT" --dry-run
```

Optional: `npm run fixture -- --out /tmp/my-fixture`

This is the primary way to exercise the TUI without touching `$HOME`.

## Tests

```bash
npm test                 # vitest, memfs — no real disk
npm run test:coverage    # focus is src/core and src/scanners
```

Scanner logic is tested against `memfs`. Shell wrappers (`brew`, `docker`, `xcrun`) mock `child_process` via `core/shell/exec.ts`. Ink screens are not unit-tested; selection / top-N / scan-row helpers are.

See [SCANNERS.md](./SCANNERS.md) for the per-scanner test checklist.

### Manual verification of shell parsers

Before trusting Homebrew / Docker / Simulator numbers on a real machine, run the same dry-run commands the wrappers wrap:

```bash
brew --cache
brew cleanup -n
docker system df
xcrun simctl list devices -j
npm config get cache
yarn cache dir
pnpm store path
pip3 cache dir
```

Confirm the output shape still matches what `src/core/shell/*` parses.

## Safety checklist — first real run against `$HOME`

1. Run against a **fixture** and confirm the summary counts/sizes match what you created.
2. Confirm `BIZZI_DRY_RUN` / `--dry-run` writes a sane `history.json` and never moves files.
3. Have a recent Time Machine (or equivalent) backup.
4. Only then run against the real `$HOME`, **with dry-run still on**, and read the full list before using `--no-dry-run`.

## Packaging

Install from the public npm package. The source lives at [MiguelBizzi/bizzi-mac-cleaner](https://github.com/MiguelBizzi/bizzi-mac-cleaner).

```bash
npm i -g bizzi-mac-cleaner
bizzi-mac-cleaner --dry-run   # first run: preview only
```

Later versions: `npm update -g bizzi-mac-cleaner`, or `npx bizzi-mac-cleaner@latest --dry-run`.

CI is [`.github/workflows/ci.yml`](.github/workflows/ci.yml). A `v*` tag that matches `package.json` runs [`.github/workflows/release.yml`](.github/workflows/release.yml) and publishes that version to npm with provenance. Report vulnerabilities in [SECURITY.md](./SECURITY.md).

## License

MIT
