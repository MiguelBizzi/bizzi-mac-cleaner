# Bizzi Mac Cleaner — Pre-Public-Release Audit (v0.2.2)

Scope: static review of `src/`, `native/walker`, docs, CI/release workflows, plus `npm test`, `npm audit`, and two CLI smoke runs.
**Not done:** no real-Trash deletion run, no Ctrl+C-mid-delete experiment, no Rust line-by-line review (only `walk.rs` first half), no VoiceOver/contrast testing. Items marked *(unverified)* are inferred from code.

## Verdict

The safety core is **better than most of the category**: Trash-only deletes (no `fs.rm`), one delete choke point, realpath-aware root check, protected paths, typed `empty` confirmation, 92 passing tests, 0600/0700 config perms, provenance publishing. It is **not yet release-ready** because of one real false-positive class (Largest Files), doc claims that are false, a red CI gate, and a "Freed X" message that is wrong.

---

## 1. Gap analysis

### A. Safety

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| A1 | **Blocker** | **Largest Files can propose files inside macOS packages/libraries** (`.photoslibrary`, `.app`, `.utm`, `.fcpbundle`, `.sparsebundle`, `.logicx`, Lightroom catalogs). Trashing one inner file corrupts the whole library. Scanner descends everything under `$HOME` except `Library`, `.git`, `node_modules`, dotted secret dirs. Only mitigation is a generic "caution" tag. | `scanners/largestFiles.ts` `EXCLUDE`; `native/walker/src/walk.rs` `LARGEST_FILES_SKIP` |
| A2 | **Blocker** | **No per-category allowlist at delete time.** `assertSafeToDelete` checks only generic rules (inside root, not git/config/system/secret). A bug or tampered scan result in *any* scanner can trash `~/Documents`, `~/Desktop`, `~/Library/Mobile Documents` (iCloud), `~/Library/Application Support`, etc. Defence in depth is missing exactly where the stakes are highest. | `core/deleteSafely.ts:33-52`, `core/paths.ts:45-76` |
| A3 | High | **Stale snapshot, no re-validation before delete.** Items are sized minutes earlier; nothing re-`lstat`s, re-checks that the path is still the same type, or detects that the project/app is now active (running dev server on a "stale" node_modules, app using a cache). | `deleteItems.ts`, `ScanScreen.tsx:172-175` |
| A4 | High | **`~/Library/Caches/*` bulk-offered as `safe`** except `com.apple.*`. Includes caches of apps that are running, and some third-party "caches" that hold real state (e.g. Spotify/Dropbox/Slack offline data, JetBrains, browsers' profiles). "safe" is overclaimed; no running-process check. | `systemCachesAndLogs.ts:44-47` |
| A5 | High | **Simulator devices flagged unused when merely `Shutdown`.** A shut-down simulator still holds installed apps and app data (test accounts, local DBs). Trashing the device dir deletes that data. Labelled `caution` but not explained as data loss. | `simulatorCaches.ts:27-31` |
| A6 | Med | **`node_modules` "stale" heuristic uses only `package.json` / `.git/HEAD` / dir mtime.** `.git/HEAD` changes rarely (only on branch switch), so an actively committed project can look stale. Not-stale is `caution`, stale is `safe`: a wrong "safe" is the dangerous direction. | `nodeModules.ts:26-38`, `walk.rs::activity_mtime_ms` |
| A7 | Med | **Protected-segment list is thin and basename-only** (`.ssh .gnupg .aws .kube Keychains`). Missing: `.config`, `.docker`, `.1password`, `Mobile Documents`, `Documents`/`Desktop`/`Pictures` roots, `.password-store`, `.terraform.d`, `.npmrc`/`.netrc` (files). Also `isGitInternal` blocks any path with a `.git` segment, but not bare repos named `*.git`. | `core/paths.ts:45` |
| A8 | Med | **TOCTOU between audit and `trash()`.** realpath is taken then `trash([req.path])` is called on the lexical path; a swap in between (symlink replace) is theoretically possible. Low exploitability for a local single-user tool. | `deleteSafely.ts:77-103` |
| A9 | Med | **Updater/shell-discovery paths trust CLI output** (`npm config get cache`, `brew --cache`…) gated by a regex hint. Good idea, but `/npm|_cacache/i` matches any path containing "npm" anywhere (e.g. `~/Documents/npm-notes`). | `scanners/npmCache.ts:12`, `helpers.ts:81-88` |
| A10 | Low | Trashed items are **not recorded in a way that lets the user restore them** (history stores original path only; no Trash location, no "undo last run"). | `core/history.ts` |

**Dry-run accuracy:** logic is sound — `isDryRun()` is evaluated per call, the real `trash()`/Finder paths are only reachable when false, and history marks `dryRun: true`. Residual risks: (1) default is **LIVE**; dry-run is opt-in (see C1). (2) dry-run still *writes* history, which is fine but undocumented in the UI. (3) The `[dry-run]` console line is suppressed when stdout is a TTY, so there is no per-item evidence of what *would* have happened beyond the final count.

**Permissions/sudo:** correct posture — no sudo, no system paths. Gaps: Full Disk Access failure is silent (denied dirs are skipped as `EACCES/EPERM`, so the user sees a small total and thinks the Mac is clean), and Finder-automation permission failure on Empty Trash surfaces as a raw osascript error.

### B. Functionality & coverage

- **B1 (High)** Coverage is dev-centric and good for that audience (node_modules, npm/yarn/pnpm, brew, Xcode, Simulator, Docker, CocoaPods, Gradle, pip, Cargo, logs, Trash, large files). Missing high-yield dev targets: `~/Library/Developer/Xcode/Products`, `CoreSimulator/Volumes` + old runtimes, `~/.cache`, `~/Library/Caches/JetBrains`, Android SDK/AVD (`~/.android`), Rust `target/` dirs, Python `__pycache__`/`.venv`, `.next/.nuxt/.turbo/dist`, Go module cache, Ollama/HuggingFace models, Time Machine local snapshots, iOS device backups (`MobileSync/Backup`, flag-only).
- **B2 (High)** **"Freed X" is false.** Items go to Trash; disk space returns only after Trash is emptied. Success screen says "Freed 4.2 GB across 12 items." Must say "Moved 4.2 GB to Trash — empty Trash to reclaim space." (`locales/en.json:37`, same in `pt.json`)
- **B3 (Med)** Docker scanner calls `dockerSystemDf()` and **discards the result**, and only offers cache/log folders — the actual big win (images/volumes/build cache) is absent. Honest, but the call is dead work and the category name "docker_unused" over-promises.
- **B4 (Med)** `xcode_archives` is a single whole-folder item. All-or-nothing deletion of every archive ever shipped (needed for symbolication). Should list per-archive with date/version.
- **B5 (Med)** Items in use / locked: errors are caught and reported per item (good, `formatTrashError`), but there's no pre-check for open files (`lsof`) and no retry/skip UX; partial failures are shown but capped at 6 lines.
- **B6 (Low)** **Extensibility is decent** (`Scanner` interface, registry, `SCANNERS.md`), but rules are code, not data. No declarative rule schema (path, risk, category-specific guard, "owner" tool, min macOS version), no per-rule safety test harness that asserts "rule X can never yield a path outside its declared pattern". That harness is what makes adding targets safe long term — and is the natural home for fix A2.

### C. Terminal UI / UX

- **C1 (Blocker for "trust")** **Default is LIVE** and the first screen is a menu. A first-time user who types `bizzi-mac-cleaner` gets live mode (red banner). Public-release default should be *preview-first*: first run (no `config.json` / `history.json`) starts in dry-run with a 3-line explanation, and "go live" is an explicit, one-time, in-app action.
- **C2 (High)** **No `--version`** (verified: `error: unknown option '--version'`). Also no `--help` examples, no `--list`/`--json` non-interactive mode (useful for CI, bug reports, and trust: "show me what you'd do").
- **C3 (High)** Confirmation modal shows only the first 8 paths truncated to 56 chars *from the left* (`…tail`). For big selections the user cannot see what is going; no "review all" view, no per-category breakdown, no size per item, no risk labels in the modal. For a delete tool, the confirmation is the product.
- **C4 (High)** Batch confirm defaults to yes on `Enter` for non-trash deletes (`key.return || input === "y"`). A stray Enter (held key, muscle memory from the list screen where Enter *opens* the modal) confirms the delete. Require `y` only, or default focus to "No".
- **C5 (Med)** No visible post-delete "where did it go / how to undo" (open Trash, Put Back). No `u` undo.
- **C6 (Med)** Scan feedback: live running total exists (good). Missing: per-scanner progress ("12/16 · Xcode"), elapsed time, explicit "skipped N folders (no permission)" with a FDA hint.
- **C7 (Med)** Accessibility/appearance: relies on ANSI color names (`cyan/yellow/red`) with no `NO_COLOR`/`FORCE_COLOR` handling, no monochrome fallback for `[x]/[~]/[ ]` vs color-only cues in banners, fixed `height={rows}` layout may clip below ~24 rows *(unverified)*, no min-size guard.
- **C8 (Med)** Update notice is a yellow line with no command. Should say `npm i -g bizzi-mac-cleaner@latest`.
- **C9 (Low)** Two locales (en/pt) is a nice touch; ensure every error string (`formatTrashError` fallback, `SECURITY`/CLI `console.error`) is localized — several are hard-coded English (`cli.ts:29`, `platform.ts`, `deleteSafely` errors like "path is outside the scan root" shown raw in the failure list).

Positive: risk tagging (`safe`/`caution`), tri-state checkboxes, per-category select-all, "reveal in Finder" (`o`), typed `empty` confirmation, `confirmEveryDelete` setting.

### D. Performance & reliability

- **D1 (High)** **Ctrl+C during delete is unhandled** *(unverified, needs a test)*. Ink's default `exitOnCtrlC` unmounts the UI, but `deleteItems()` is a plain sequential loop with no `AbortSignal` and no SIGINT/SIGTERM handler; the in-flight `trash()` and the remaining queue may keep running with no UI, or exit mid-history-write. Required: explicit SIGINT handler → finish current item, stop the loop, flush history, print "Stopped: N moved, M not touched".
- **D2 (Med)** `history.json` is rewritten whole **per item** (read-modify-write, non-atomic). Ctrl+C or a crash mid-write truncates it and `readHistory` silently resets to `[]` (loses audit trail). Use append-only JSONL or write-temp-then-rename.
- **D3 (Med)** Scan is **sequential across scanners** (`runScanners` loops one at a time); concurrency exists only inside a scanner. Independent scanners (npm, brew, Xcode, Gradle…) could run in parallel.
- **D4 (Med)** `dirSize` spawns one `worker_thread` per call when native is absent (limit 2); each item in `~/Library/Caches/*` is sized separately — hundreds of tiny workers. Inline fallback is fine for small dirs.
- **D5 (Low)** Native walker: good (getattrlistbulk, rayon, abort flag). Needs: fuzz/tests on the unsafe record parser, behaviour on APFS firmlinks/cloud-evicted files (`dataless`), and logical vs physical size (sparse files/clones inflate "freed" numbers). Memory is bounded for Top-N but `node_modules`/scan results keep all items in React state.
- **D6 (Low)** Fallback JS walker uses `Promise.all` in 16-wide batches, which stalls on the slowest dir; fine for now.

### E. Public readiness

- **E1 (Blocker)** **`SECURITY.md` says "does not phone home," but `app.tsx` calls `https://registry.npmjs.org/bizzi-mac-cleaner/latest` on every launch** (`core/updateCheck.ts`). Harmless in practice, but it's a false trust claim in a tool whose pitch is trust. Either remove the claim, or add an opt-out (`BIZZI_NO_UPDATE_CHECK=1`, Settings toggle) and document it.
- **E2 (Blocker)** **CI/release is currently red.** `npm audit --omit=dev` reports 2 vulns (high: `brace-expansion` via `globby` ← `trash`; moderate: `fast-uri`). Both CI and `release.yml` run it as a gate, so no release can ship. `npm audit fix` is available; verify the `trash` chain stays intact. (Low real-world risk — local tool, DoS class — but the gate must be green or consciously relaxed to `--audit-level=high` after fixing.)
- **E3 (High)** `SECURITY.md` references a Homebrew tap and `brew audit` that **do not exist**; README documents npm only. Remove or ship the tap.
- **E4 (High)** README leads with install commands before explaining what it deletes; the "Safety checklist" (backup, fixture, dry-run) is buried at the bottom. First-run onboarding doesn't exist in-app.
- **E5 (Med)** Distribution: npm requires Node ≥ 20 (many Macs have none) — README tells users to `brew install node@20`. A single-binary / Homebrew formula / signed-and-notarized release would remove that friction. Native `.node` addons are unsigned; ship checksums and document. CI/Release test only Node 20 on `macos-latest`: add Node 22/24, Intel (x64) runtime test, and macOS-version matrix. The x64 binary is cross-compiled and never executed in CI.
- **E6 (Med)** No CHANGELOG, no issue templates, no CONTRIBUTING, no `--help` examples, README doesn't show a screenshot/GIF (the UI is the product).
- **E7 (Low)** `engines` allows Node 20 (EOL window) — consider `>=22`.

---

## 2. UX/UI critique → premium standard

1. **Preview-first first run**: welcome panel → "Scan (read-only)" → results → "Send to Trash" is where the one-time live opt-in happens.
2. **Summary header, always visible**: `Selected 6 · 4.2 GB · 2 need review`, with risk legend (● safe ◐ review).
3. **A real review step**: confirm modal = scrollable full list grouped by category, each row `size · age · path (middle-truncated, home as ~) · risk`. Typed confirmation only for destructive/caution categories; `y` only (never Enter) otherwise.
4. **Explain every line**: `?` on a row shows *what it is, why it's safe, what regenerates it, how long to rebuild* (e.g. "DerivedData — rebuilt on next build, ~2–10 min"). This is the trust feature that competitors don't have.
5. **Honest outcomes**: "Moved to Trash: 4.2 GB. Empty Trash to reclaim it." + `Put Back` instructions + `u` undo of last run.
6. **Progress that tells a story**: per-scanner checklist with live sizes, elapsed, and "3 folders skipped — grant Full Disk Access (press F)".
7. **Quiet, consistent chrome**: single accent color, dim secondary text, `NO_COLOR` support, minimum-size warning, consistent key legend footer (`↑↓ move · space select · a all · enter review · ? why · q quit`).
8. **Errors without panic**: "1 item is in use by Xcode — quit Xcode and retry" with a retry key; never raw `Command failed`.

---

## 3. Prioritized roadmap

### Critical — blockers for public release
1. **A1** Exclude package bundles (`*.photoslibrary`, `*.app`, `*.sparsebundle`, `*.utm`, `*.fcpbundle`, `*.logicx`, `*.tvlibrary`, `*.imovielibrary`, Lightroom/Capture One catalogs) and treat anything inside as non-offerable; add `Documents/Desktop/Pictures/Movies/Music` per-file warning or opt-in.
2. **A2** Per-category deletion allowlist enforced inside `deleteSafely` (category → permitted path patterns). Unknown category or non-matching path = refuse.
3. **E2** Make `npm audit` green (`npm audit fix`, re-run tests); verify `trash` still works.
4. **E1** Fix the "no phone home" claim: opt-out + documentation.
5. **B2** Replace "Freed" with "Moved to Trash"; add reclaim hint.
6. **C1** Preview-first on first run / safer default.
7. **C4** Remove Enter as confirm for deletes.
8. **D1** SIGINT/SIGTERM handling + abortable delete loop (+ test).
9. **E3** Remove or ship the Homebrew tap references.

### High impact
A3 (re-validate before delete), A4/A5 (honest risk levels + explainers; running-app check), A6 (better stale signal: lockfile/`.git` index/`git log -1`), C2 (`--version`, `--help`, `--list --json`), C3 (full review view), C6 (FDA detection + skipped-count), D2 (atomic/append-only history + per-run record + undo), B1 (add Rust `target/`, `.next`, `__pycache__`, Android, JetBrains, Xcode Products/runtimes), B4 (per-archive list), E4 (README restructure + GIF), E5 (Node matrix, x64 test).

### Nice to have
Parallel scanners (D3), declarative rule files + rule-conformance tests (B6), CHANGELOG/templates (E6), `NO_COLOR` + min-size guard (C7), localized error strings (C9), notarized single-binary/Homebrew distribution, physical-size accounting (D5), fuzz tests for the native parser, SBOM + checksums on release.

---

## 4. "Best-in-class" checklist

| Capability | Status |
|---|---|
| Never permanently deletes (Trash only) | ✅ |
| Single delete choke point with path guards | ✅ |
| Symlink-aware containment | ✅ |
| Protected system/secret paths | 🟡 thin list |
| Per-category allowlist at delete time | ❌ |
| Package/library (bundle) awareness | ❌ |
| Re-validate before delete / in-use detection | ❌ |
| Preview-first default | ❌ (live by default) |
| Full review list before confirm | 🟡 first 8 only |
| Typed confirm for permanent action | ✅ |
| Honest outcome messaging | ❌ ("Freed") |
| Undo / restore guidance | ❌ |
| Audit log | 🟡 exists, non-atomic, no restore info |
| Graceful Ctrl+C | ❓ unverified, likely ❌ |
| Per-item explanations ("why safe") | ❌ |
| FDA/permission guidance in-app | ❌ |
| Fast native scanning | ✅ |
| Parallel scanners | ❌ |
| Test suite (unit) | ✅ 92 passing; ❌ no TUI/integration/delete-on-real-FS tests |
| Supply chain (provenance, audit gate) | 🟡 provenance ✅, audit gate currently red |
| Claims match behavior | ❌ (phone-home, Homebrew) |
| `--version/--help/--json` | ❌ |
| Install friction (no Node needed) | ❌ |
| Docs w/ screenshots, changelog | ❌ |

**Where you stand:** engineering foundations are in the top tier for an indie cleaner; the gaps are *trust surface area* (what the user sees, is told, and can undo) and *defence in depth* (assuming a scanner will eventually be wrong). Fixing the 9 critical items is roughly a focused week and moves this from "good tool" to "safe to put in front of strangers."
