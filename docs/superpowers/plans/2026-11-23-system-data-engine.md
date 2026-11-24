# System Data Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the ad-hoc `system_caches_logs` scanner into a catalog-driven, version-aware System Data engine whose every target carries a documented safety rating, rationale and impact, and whose delete policy is derived from the same catalog.

**Architecture:** A single declarative catalog (`src/systemData/catalog.ts`) is the source of truth for the taxonomy. Three consumers read it: the `system_data` scanner (what to offer), the delete policy (what may be trashed, what is hard-denied for *every* category), and a docs generator (`docs/system-data/TAXONOMY.md`). Targets the tool must not delete itself (snapshots, VM disks, Ollama, simulator runtimes, Apple Intelligence) become non-selectable *advisory* items that show size, explanation and the official command — the tool never runs those commands.

**Tech Stack:** TypeScript (ESM, Node ≥ 20), Ink 5 / React 18 TUI, vitest + memfs, `trash` for deletes. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-23-system-data-brief.md` (also read `AUDIT.md` §A2/A4/B1/B6 — this plan closes those findings for System Data).

## Global Constraints

- Start from a clean tree: commit the current uncommitted work (`src/core/deletePolicy.ts` and friends) before Task 1. This plan builds on `categoryViolation()` in `src/core/deletePolicy.ts`.
- Deletes go through `deleteSafely()` → `trash()` only. Never `fs.rm`, never `sudo`, never execute an advisory's command — commands are displayed verbatim, nothing more.
- Shell-outs happen only when `allowShellDiscovery(root)` is true, and only via absolute paths: `/usr/bin/sw_vers`, `/usr/bin/tmutil`, `/usr/bin/plutil`, `/usr/bin/xcrun`, `/usr/bin/lsappinfo`, `/bin/ps`, `/usr/bin/getconf` (prevents `$PATH` hijack).
- `MIN_SUPPORTED_MACOS = 12` (Monterey). `VERIFIED_THROUGH_MACOS = 27`. Versions are read from `sw_vers`, never assumed to be `10.x`/`1x` (Tahoe is 26, then 27).
- On a macOS newer than `VERIFIED_THROUGH_MACOS`, every `safe` target is offered as `review` ("expertise over aggression"). Below `MIN_SUPPORTED_MACOS`, the `system_data` scanner yields advisories only.
- Hard-deny ("never") targets win over every allow rule, for **every** cleanup category.
- Every user-visible string exists in both `src/locales/en.json` and `src/locales/pt.json`.
- Tests use memfs and mock `src/core/shell/exec.ts`; no test touches the real disk except the docs-in-sync test, which reads a committed file.
- Commit after every task with a Conventional Commits message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A catalog path that is a symlink (or sits under a symlinked parent) pointing outside its pattern**, e.g. `~/Library/Caches` → `~/Documents`. Expect the policy to evaluate both the lexical and the real path and refuse. → test in Task 5.
2. **A macOS newer than the tool knows (28) or `sw_vers` failing.** Expect: no crash, all `safe` become `review`, header says "not yet verified". → tests in Tasks 2 and 7.
3. **No Full Disk Access.** Protected locations return `EPERM`; expect them listed as "needs Full Disk Access", never silently counted as 0 or as "clean". → test in Task 7.
4. **The owning app is running** (Slack open while its cache is selected, or opened between scan and delete). Expect downgrade to `review` with a note at scan time and a refusal at delete time. → tests in Tasks 7 and 9.
5. **Sparse VM disks** (`Docker.raw` logical 64 GB, 9 GB on disk). Expect the advisory to show allocated bytes, not logical size. → test in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/system-data/README.md` | Hand-written expert guide: what System Data is, safety model, version matrix, sources, verification log |
| `docs/system-data/TAXONOMY.md` | Generated from the catalog; never hand-edited |
| `src/systemData/macos.ts` | Version parse/detect, range checks, support level |
| `src/systemData/types.ts` | Catalog types |
| `src/systemData/match.ts` | Pattern matching + expansion against a root |
| `src/systemData/catalog.ts` | The taxonomy data (`TARGETS`) + lookups |
| `src/systemData/probes.ts` | FDA probe, running apps, plist values, snapshots, simulator runtimes, `getconf` dirs |
| `src/systemData/context.ts` | `getSystemDataContext(root)`: macOS + support + FDA + running apps, cached per root |
| `src/systemData/scanner.ts` | `systemDataScanner` (trash targets + advisories) |
| `src/systemData/advisories.ts` | Builders for each advisory item |
| `src/systemData/explain.ts` | Item → explanation lines for the TUI |
| `src/systemData/docs.ts` | `renderTaxonomyMarkdown()` |
| `src/systemData/preflight.ts` | Delete-time re-checks for `system_data` items |
| `scripts/generate-system-data-docs.ts` | Writes `TAXONOMY.md` |
| `src/core/deletePolicy.ts` | Gains never-deny + `system_data` rules; drops `system_caches_logs` |
| `src/scanners/types.ts` | `ScannerId` gains `system_data`, loses `system_caches_logs`; `CleanupItem` gains fields |
| `src/scanners/systemCachesAndLogs.ts` (+test) | **Deleted** (absorbed into catalog) |
| `src/core/selection.ts` | Advisory items are never selectable |
| `src/core/deleteItems.ts` | Calls preflight for `system_data` |
| `src/screens/ScanScreen.tsx`, `MainMenu.tsx`, `ConfirmDeleteModal.tsx`, `src/app.tsx` | System Data menu entry, header, advisory rows, `?` explain panel, impact lines |
| `src/screens/SystemDataHeader.tsx` | Header component |

---

### Task 1: Expert guide and verification log

The research deliverable. The catalog in Task 4 encodes this document, so it comes first.

**Files:**
- Create: `docs/system-data/README.md`

**Interfaces:**
- Produces: the verified taxonomy table that Task 4 encodes. If verification contradicts a row in Task 4's table, edit Task 4's table in this plan file in the same commit and record why in the log.

- [ ] **Step 1: Verify the eight uncertain facts on this Mac (macOS 27) and record each result with the exact command and output excerpt**

| # | Claim to verify | How |
|---|---|---|
| V1 | Terminal without FDA reading `~/Library/Containers/<other app>/Data/Library/Caches` triggers the "access data from other apps" prompt on 14+; `~/Library/Group Containers/*` on 15+ | `ls ~/Library/Containers/com.apple.Notes/Data/Library/Caches` from a non-FDA terminal |
| V2 | `plutil -extract "<key>" raw -o - <file>` exists (12+) and prints dates as ISO-8601 | `plutil -extract CFBundleName raw -o - /System/Applications/Notes.app/Contents/Info.plist` |
| V3 | `tmutil listlocalsnapshots /` runs without sudo; `tmutil deletelocalsnapshots` needs admin | run listing; `man tmutil` |
| V4 | `xcrun simctl runtime list -j` returns an object keyed by UUID with `identifier`, `version`, `sizeBytes`, `lastUsedAt`, `deletable` | run it (Xcode installed) |
| V5 | Docker Desktop disk is `~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`, is sparse (`du -h` ≪ `ls -lh`), and `stat` on it does not prompt | `ls -lhs`, `du -h` |
| V6 | `lsappinfo list` lines contain `bundleID="…"` for each running app | run it |
| V7 | `ls ~/Library/Safari` fails with `Operation not permitted` without FDA (FDA probe) — `~/Library/Application Support/com.apple.TCC` is absent on 27, so it cannot be the probe | run it |
| V8 | LM Studio models live in `~/.lmstudio/models/<publisher>/<model>` (legacy `~/.cache/lm-studio/models`) | LM Studio docs |

- [ ] **Step 2: Write `docs/system-data/README.md`** with these sections, in this order: *What "System Data" is* (macOS's catch-all for storage it can't attribute to Apps/Documents/Photos/etc.: user and system caches, logs, APFS local snapshots, device backups, developer and AI artifacts, VM disks, swap/sleepimage, `/private/var/folders`, purgeable space); *The safety model* (the four levels below, the never-deny rule, Trash-only, no sudo, advisories); *Version matrix* (rows 12, 13, 14, 15, 26, 27; columns: Storage settings path — "About This Mac › Storage › Manage" on 12, "System Settings › General › Storage" on 13+; container data protection — 14+; group container protection — 15+; Apple Intelligence assets — 15.1+); *What we never touch and why* (one paragraph per `never` target from Task 4); *Sources* (below); *Verification log* (Step 1 results with date and macOS build).

Safety levels (exact wording used throughout code and docs):
- **safe** — regenerated automatically; removing it costs at most a rebuild/re-download and never loses user data.
- **review** — regenerable, but removal has a visible cost (sign-outs, multi-GB re-download, lost device symbols, an old backup). Offered, unselected by default, explained.
- **advisory** — reclaimable only through macOS or the owning tool. Shown with size and the official command; never deleted by us.
- **never** — deleting breaks macOS, an app, sync, or destroys user data. Hard-denied for every category.

Sources (verify each URL resolves and its title matches; replace with the current Apple URL if moved): Apple Support "Free up storage space on Mac"; Apple Support "About Time Machine local snapshots"; Apple Support "Locate backups of your iPhone, iPad, and iPod touch"; WWDC23 "What's new in privacy" (app container protection); WWDC24 "What's new in privacy" (group container protection); `man tmutil`, `man plutil`, `xcrun simctl help runtime`; Hugging Face "Manage huggingface_hub cache-system"; Ollama FAQ "Where are models stored?"; Docker Docs "Disk utilization in Docker Desktop" (Mac FAQ); Android Developers "Create and manage virtual devices".

- [ ] **Step 3: Commit**

```bash
git add docs/system-data/README.md docs/superpowers/plans/2026-11-23-system-data-engine.md
git commit -m "docs: add System Data expert guide and verification log"
```

---

### Task 2: macOS version awareness

**Files:**
- Create: `src/systemData/macos.ts`
- Test: `src/systemData/macos.test.ts`

**Interfaces:**
- Produces:
  - `interface MacOSVersion { major: number; minor: number; patch: number }`
  - `const MIN_SUPPORTED_MACOS = 12`, `const VERIFIED_THROUGH_MACOS = 27`
  - `parseProductVersion(s: string): MacOSVersion | null`
  - `darwinToMacOS(release: string): MacOSVersion | null` — Darwin 21–24 → macOS 12–15 (`major = d - 9`); Darwin ≥ 25 → `major = d + 1` (25 → 26 Tahoe, 26 → 27); anything else → null
  - `currentMacOS(): MacOSVersion | null` — sync, cached; `execFileSync("/usr/bin/sw_vers", ["-productVersion"])`, falls back to `darwinToMacOS(os.release())` on error
  - `setMacOSForTests(v: MacOSVersion | null | undefined): void` (`undefined` clears the override and the cache)
  - `compareVersions(a, b): number`
  - `inRange(v: MacOSVersion | null, range?: { min?: string; max?: string }): boolean` — range bounds are strings like `"15.1"`; no range → true; `v === null` → true only when no range
  - `supportLevel(v: MacOSVersion | null): "unsupported" | "verified" | "unverified"` — null → `"unverified"`

- [ ] **Step 1: Write the failing tests**

```ts
it("parses sw_vers output", () => {
  expect(parseProductVersion("27.0.1\n")).toEqual({ major: 27, minor: 0, patch: 1 });
  expect(parseProductVersion("14.6")).toEqual({ major: 14, minor: 6, patch: 0 });
  expect(parseProductVersion("garbage")).toBeNull();
});
it("maps Darwin releases across the Tahoe renumbering", () => {
  expect(darwinToMacOS("21.6.0")?.major).toBe(12);
  expect(darwinToMacOS("24.1.0")?.major).toBe(15);
  expect(darwinToMacOS("25.0.0")?.major).toBe(26);
  expect(darwinToMacOS("27.0.0")?.major).toBe(28);
  expect(darwinToMacOS("19.0.0")).toBeNull();
});
it("checks ranges with minor versions", () => {
  const v = (s: string) => parseProductVersion(s)!;
  expect(inRange(v("15.0"), { min: "15.1" })).toBe(false);
  expect(inRange(v("15.1"), { min: "15.1" })).toBe(true);
  expect(inRange(v("26.0"), { min: "15.1" })).toBe(true);
  expect(inRange(null, { min: "14" })).toBe(false);
  expect(inRange(null, undefined)).toBe(true);
});
it("classifies support levels", () => {
  const v = (s: string) => parseProductVersion(s)!;
  expect(supportLevel(v("11.7"))).toBe("unsupported");
  expect(supportLevel(v("27.0.1"))).toBe("verified");
  expect(supportLevel(v("28.0"))).toBe("unverified");
  expect(supportLevel(null)).toBe("unverified");
});
it("falls back to os.release when sw_vers fails", () => {
  // vi.mock("node:child_process") execFileSync throws; vi.mock("node:os") release → "25.1.0"
  setMacOSForTests(undefined);
  expect(currentMacOS()?.major).toBe(26);
});
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/macos.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `src/systemData/macos.ts`** with the signatures above.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(system-data): detect macOS version with Tahoe-era numbering`

---

### Task 3: Catalog types and pattern matcher

**Files:**
- Create: `src/systemData/types.ts`, `src/systemData/match.ts`
- Test: `src/systemData/match.test.ts`

**Interfaces:**
- Consumes: `ScannerId` from `src/scanners/types.ts`.
- Produces (`types.ts`):

```ts
export type SafetyLevel = "safe" | "review" | "advisory" | "never";
export type TaxonomyGroup =
  | "user_caches" | "logs" | "web_data" | "developer" | "ai_models"
  | "device_backups" | "snapshots" | "virtualization" | "mail_messages" | "system_managed";
export interface SystemDataTarget {
  id: string;                         // e.g. "caches.app"; i18n keys are sd.<id>.<field>
  group: TaxonomyGroup;
  safety: SafetyLevel;
  /** "/"-separated. Relative = under the scan root (home). Absolute ("/…") = documentation/deny only.
   *  Segment "*" = any one segment; a glob inside a segment ("com.apple.*", "*.ipsw") matches within it;
   *  "<uuid>" = a UUID segment; a trailing "**" = this path and everything under it (never targets only). */
  patterns: string[];
  /** Segment globs that a "*" in `patterns` must not match. */
  exclude?: string[];
  /** Documented here, scanned and deleted under another scanner's category. */
  ownedBy?: ScannerId;
  macos?: { min?: string; max?: string };
  /** "required": skip unless FDA granted. { fromMacOS }: required only on that version and later. */
  fda?: "required" | { fromMacOS: string };
  /** How to tell the owning app is running. "bundleIdFolder": the first "*" segment is a bundle id.
   *  "folderName": the first "*" segment is an app name (match process basename, prefix match for "<name> Helper"). */
  runningCheck?: "bundleIdFolder" | "folderName" | { names: string[] };
  /** Directory matched by the first "*" must contain one of these entries (e.g. Chromium userData markers). */
  markerAnyOf?: string[];
  /** Advisory only: shown verbatim, never executed. */
  commands?: string[];
  sources: string[];
}
```

- Produces (`match.ts`):
  - `relSegments(root: string, target: string): string[] | null` — null when outside root
  - `matchPattern(pattern: string, rel: string[]): boolean` — exact-length match, or prefix match when the pattern ends in `**`
  - `firstWildcardValue(pattern: string, rel: string[]): string | undefined` — the segment the first `*`/glob segment matched
  - `expandPattern(root: string, pattern: string, exclude?: string[]): Promise<string[]>` — walks `readdir` for each wildcard segment (no recursion beyond the pattern depth, no symlink following: skip entries where `lstat().isSymbolicLink()`), returns absolute paths that exist; missing/unreadable dirs yield nothing; `EPERM`/`EACCES` are reported via the returned object instead — so the actual return type is `Promise<{ paths: string[]; denied: string[] }>`
  - `samplePath(pattern: string): string[]` — test helper: `*`→`"sample"`, glob → glob with `*` replaced by `"sample"`, `<uuid>`→`"00000000-0000-0000-0000-000000000000"`, drops trailing `**`

- [ ] **Step 1: Write the failing tests**

```ts
it("matches single-segment wildcards and in-segment globs", () => {
  expect(matchPattern("Library/Caches/*", ["Library", "Caches", "com.foo"])).toBe(true);
  expect(matchPattern("Library/Caches/*", ["Library", "Caches", "a", "b"])).toBe(false);
  expect(matchPattern("Library/Caches/com.apple.*", ["Library", "Caches", "com.apple.Safari"])).toBe(true);
  expect(matchPattern("Library/iTunes/iPhone Software Updates/*.ipsw", ["Library","iTunes","iPhone Software Updates","x.ipsw"])).toBe(true);
});
it("treats regex metacharacters in patterns literally", () => {
  expect(matchPattern("Library/Caches/com.apple.*", ["Library", "Caches", "comXapple.y"])).toBe(false);
});
it("matches UUID segments only", () => {
  const p = "Library/Developer/CoreSimulator/Devices/<uuid>";
  expect(matchPattern(p, ["Library","Developer","CoreSimulator","Devices","A1B2C3D4-0000-1111-2222-333344445555"])).toBe(true);
  expect(matchPattern(p, ["Library","Developer","CoreSimulator","Devices","device_set.plist"])).toBe(false);
});
it("treats trailing ** as subtree", () => {
  expect(matchPattern("Library/Mobile Documents/**", ["Library", "Mobile Documents"])).toBe(true);
  expect(matchPattern("Library/Mobile Documents/**", ["Library", "Mobile Documents", "a", "b"])).toBe(true);
  expect(matchPattern("Library/Mobile Documents/**", ["Library", "Mobile"])).toBe(false);
});
it("expands patterns against memfs, honouring exclude and skipping symlinks", async () => {
  vol.fromJSON({ "/h/Library/Caches/a/f": "1", "/h/Library/Caches/com.apple.x/f": "1" });
  vol.symlinkSync("/h/Documents", "/h/Library/Caches/link");
  const r = await expandPattern("/h", "Library/Caches/*", ["com.apple.*"]);
  expect(r.paths).toEqual(["/h/Library/Caches/a"]);
});
it("reports EPERM directories as denied", async () => { /* mock fsp.readdir to throw {code:"EPERM"} for /h/Library/Safari */
  const r = await expandPattern("/h", "Library/Safari/Favicon Cache");
  expect(r.denied).toEqual(["/h/Library/Safari"]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/match.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `types.ts` and `match.ts`. Segment globs compile to anchored regexes with every char escaped except `*` → `[^/]*`; UUID regex `/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(system-data): add catalog types and pattern matcher`

---

### Task 4: The taxonomy catalog

**Files:**
- Create: `src/systemData/catalog.ts`
- Modify: `src/scanners/types.ts` (add `"system_data"` to `ScannerId`; keep `system_caches_logs` until Task 7)
- Modify: `src/locales/en.json`, `src/locales/pt.json`
- Test: `src/systemData/catalog.test.ts`

**Interfaces:**
- Consumes: Task 3 types and `matchPattern`, `samplePath`.
- Produces:
  - `TARGETS: readonly SystemDataTarget[]`
  - `targetById(id: string): SystemDataTarget | undefined`
  - `findDeletableTarget(rel: string[]): SystemDataTarget | undefined` — first target with `safety` `safe|review`, no `ownedBy`, a relative pattern that `matchPattern`es `rel`, and whose `exclude` does not match the wildcard value
  - `findNeverTarget(rel: string[], absolute: string): SystemDataTarget | undefined` — relative never patterns tested against `rel`, absolute ones against `absolute`
  - i18n keys `sd.<id>.label`, `sd.<id>.why` for all targets; plus `sd.<id>.regen` and `sd.<id>.impact` for `safe`/`review`; plus `sd.<id>.impact` for `advisory`; `sd.group.<TaxonomyGroup>` labels; `sd.safety.<SafetyLevel>` labels and one-line definitions `sd.safety.<level>.def` (Task 1 wording).

The catalog rows. "Notes" is the substance the `why`/`regen`/`impact` copy must say — write it in plain language, one or two sentences each, and translate to pt.

**user_caches**

| id | patterns | safety | other fields | Notes |
|---|---|---|---|---|
| `caches.app` | `Library/Caches/*` | safe | exclude `com.apple.*`, `Homebrew`, `CocoaPods`, `pip`, `Yarn`, `com.docker.docker`, `Docker Desktop`; runningCheck `bundleIdFolder` | Third-party app caches; apps rebuild them. Running app → review. |
| `caches.apple` | `Library/Caches/com.apple.*` | review | runningCheck `bundleIdFolder` | Apple app/daemon caches; rebuilt, but some daemons re-download data and Safari etc. lose warm state. |
| `caches.container` | `Library/Containers/*/Data/Library/Caches` | review | fda `{fromMacOS:"14"}`; runningCheck `bundleIdFolder` | Sandboxed app caches. From Sonoma, reading other apps' containers needs FDA, so without it we skip instead of triggering prompts. |
| `caches.chromium_apps` | `Library/Application Support/*/Cache`, `…/*/Code Cache`, `…/*/GPUCache`, `…/*/DawnCache`, `…/*/DawnGraphiteCache`, `…/*/DawnWebGPUCache`, `…/*/Service Worker/CacheStorage`, `…/*/CachedData`, `…/*/CachedExtensionVSIXs` (`…` = `Library/Application Support`) | safe | markerAnyOf `Local State`, `Preferences`; runningCheck `folderName` | Electron/Chromium app HTTP, shader and code caches (Slack, VS Code, Discord…). The marker proves it is a Chromium userData dir. |

**logs**

| `logs.user` | `Library/Logs/*` | safe | — | App logs and crash reports (`DiagnosticReports`). Only useful when debugging. |

**web_data**

| `web.http_storages` | `Library/HTTPStorages` | review | — | Per-app cookie/HTTP stores; deleting signs you out of apps. |
| `web.webkit` | `Library/WebKit` | review | — | WebKit website data (local storage, IndexedDB); site logins and offline data are lost. |
| `web.safari_favicons` | `Library/Safari/Favicon Cache` | safe | fda `required` | Favicons re-fetched on next visit. |

**developer** (rows with `ownedBy` document existing scanners; their patterns must equal those scanners' `deletePolicy` rules)

| `dev.xcode_derived_data` | `Library/Developer/Xcode/DerivedData` | safe | ownedBy `xcode_derived_data` | Build intermediates; next build is slower. |
| `dev.xcode_archives` | `Library/Developer/Xcode/Archives` | review | ownedBy `xcode_archives` | Shipped builds + dSYMs needed to symbolicate crashes. |
| `dev.simulator_caches` | `Library/Developer/CoreSimulator/Caches` | safe | ownedBy `simulator_caches` | dyld/shared caches rebuilt on boot. |
| `dev.simulator_devices` | `Library/Developer/CoreSimulator/Devices/<uuid>` | review | ownedBy `simulator_caches` | A simulator with its installed apps and data. |
| `dev.npm`, `dev.yarn`, `dev.pnpm`, `dev.brew`, `dev.cocoapods`, `dev.gradle`, `dev.pip`, `dev.cargo`, `dev.docker_caches` | the paths in `deletePolicy.ts` `RULES` (`.npm/_cacache`, `Library/Caches/Yarn`, `Library/pnpm/store`, `Library/Caches/Homebrew`, `Library/Caches/CocoaPods`, `.gradle/caches`, `Library/Caches/pip`, `.cargo/registry/cache` + `.cargo/registry/src`, `Library/Caches/com.docker.docker` + `Library/Caches/Docker Desktop`) | safe | ownedBy the matching scanner | Package downloads; re-fetched on next install. |
| `dev.device_support` | `Library/Developer/Xcode/iOS DeviceSupport/*`, `…/watchOS DeviceSupport/*`, `…/tvOS DeviceSupport/*`, `…/visionOS DeviceSupport/*` | review | — | Per-OS-version debug symbols copied from devices (2–5 GB each). Re-copied when that device connects; versions you no longer own a device for are pure waste. Replaces the old whole-folder items. |
| `dev.xcode_previews` | `Library/Developer/Xcode/UserData/Previews` | review | — | SwiftUI preview simulators; rebuilt, first preview is slow. |
| `dev.xcode_products` | `Library/Developer/Xcode/Products` | safe | — | Built products for previews/testing. |
| `dev.xcode_doc_cache` | `Library/Developer/Xcode/DocumentationCache` | safe | — | Downloaded docs cache. |
| `dev.playground_devices` | `Library/Developer/XCPGDevices` | safe | — | Playground simulators. |
| `dev.simulator_runtimes` | (none) | advisory | commands `xcrun simctl runtime list`, `xcrun simctl runtime delete <identifier>`, `xcrun simctl delete unavailable` | Runtimes are disk images under `/Library/Developer/CoreSimulator` managed by `simctl`; deleting files there corrupts Xcode's runtime database. |
| `dev.android_system_images` | `Library/Android/sdk/system-images/*/*/*` | review | — | Emulator OS images; re-download 1–2 GB via SDK Manager. |
| `dev.android_avd` | `.android/avd/*.avd` | review | runningCheck `{names:["qemu-system-aarch64","qemu-system-x86_64"]}` | An emulator with its data. |
| `dev.go_modcache` | `go/pkg/mod` | advisory | commands `go clean -modcache` | Files are read-only by design; use Go's own command. |
| `dev.uv_cache` | `.cache/uv` | safe | — | Python uv package cache. |
| `dev.precommit_cache` | `.cache/pre-commit` | safe | — | Hook environments, rebuilt on next run. |

**ai_models**

| `ai.huggingface` | `.cache/huggingface/hub/models--*`, `.cache/huggingface/hub/datasets--*` | review | — | One model/dataset repo each; re-download can be tens of GB. `HF_HOME` overrides are not followed (documented). |
| `ai.lmstudio` | `.lmstudio/models/*/*`, `.cache/lm-studio/models/*/*` | review | runningCheck `{names:["LM Studio"]}` | One downloaded model each. |
| `ai.torch_hub` | `.cache/torch/hub` | review | — | PyTorch Hub downloads. |
| `ai.whisper` | `.cache/whisper` | review | — | Whisper model weights. |
| `ai.ollama` | `.ollama/models` | advisory | commands `ollama list`, `ollama rm <model>` | Blobs are shared between models via manifests; trashing files breaks other models. |
| `ai.apple_intelligence` | (none) | advisory | macos `{min:"15.1"}` | On-device models managed by macOS in system storage; turn Apple Intelligence off in System Settings to release them. Size not measurable without admin. |

**device_backups**

| `backups.ios` | `Library/Application Support/MobileSync/Backup/*` | review | fda `required` | A full iPhone/iPad backup. If it is the only backup of that device, emptying Trash loses it for good. Description shows device name and last backup date. |
| `backups.ipsw` | `Library/iTunes/iPhone Software Updates/*.ipsw`, `Library/iTunes/iPad Software Updates/*.ipsw` | safe | — | Downloaded iOS installers; Finder re-downloads when needed. |

**snapshots**

| `snapshots.tm_local` | (none) | advisory | commands `tmutil listlocalsnapshots /`, `sudo tmutil deletelocalsnapshots <date>` | APFS local Time Machine snapshots. macOS deletes them automatically when space is needed; shown so users understand the number. |

**virtualization**

| `vm.docker_raw` | `Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw` | advisory | commands `docker system df`, `docker system prune` | All images, containers and volumes live in this one disk; trashing it destroys them. Size is allocated bytes (sparse file). |
| `vm.colima` | `.colima` | advisory | commands `colima list`, `colima delete <profile>` | Colima VM disks. |

**mail_messages**

| `mail.downloads` | `Library/Containers/com.apple.mail/Data/Library/Mail Downloads` | safe | fda `required`; runningCheck `{names:["Mail"]}` | Copies of attachments you opened; originals stay in the mailbox. |
| `messages.attachments` | `Library/Messages/Attachments` | advisory | fda `required` | Your Messages attachments (user data). Use Messages › Settings › Keep messages, or Storage › Messages. |

**system_managed** (all `advisory` or `never`)

| `sys.var_folders` | (none; measured from `getconf DARWIN_USER_CACHE_DIR` and `DARWIN_USER_TEMP_DIR`) | advisory | — | Per-user temp/cache under `/private/var/folders`; in use by running apps, cleared on restart. Restart is the safe way. |

**never** (all patterns are subtrees `/**` unless marked *exact*)

| id | patterns | Notes |
|---|---|---|
| `never.cloud_files` | `Library/Mobile Documents/**`, `Library/CloudStorage/**` | iCloud Drive / Dropbox / OneDrive / Google Drive file-provider data. |
| `never.identity_sync` | `Library/Caches/com.apple.bird/**`, `Library/Caches/CloudKit/**`, `Library/Caches/com.apple.akd/**`, `Library/Caches/com.apple.amsaccountsd/**`, `Library/Caches/com.apple.AuthenticationServices*/**`, `Library/Caches/FamilyCircle/**`, `Library/Caches/com.apple.HomeKit/**`, `Library/Caches/PassKit/**`, `Library/Caches/com.apple.passd/**`, `Library/Caches/com.apple.iCloudHelper/**` | Account, iCloud sync, Wallet and Home state stored under "Caches". |
| `never.in_flight` | `Library/Caches/com.apple.nsurlsessiond/**`, `Library/Caches/TemporaryItems/**` | Active background downloads and open/autosaved documents. |
| `never.personal_data` | `Library/Messages/**`, `Library/Mail/**`, `Library/Photos/**`, `Library/Calendars/**`, `Library/Application Support/AddressBook/**`, `Library/Keychains/**`, `Library/Cookies/**`, `Library/Accounts/**`, `Library/Preferences/**` | User data and settings. |
| `never.group_containers` | `Library/Group Containers/**` | Shared app-group state (and protected from 15). |
| `never.vm_internals` | `Library/Containers/com.docker.docker/Data/vms/**`, `.ollama/models/blobs/**`, `.ollama/models/manifests/**`, `.colima/**` | Managed by their tools. |
| `never.roots` | *exact*: `Library`, `Library/Caches`, `Library/Application Support`, `Library/Containers`, `Library/Application Support/MobileSync`, `Library/Application Support/MobileSync/Backup`, `Library/Developer/CoreSimulator/Devices` | Parents of cleanable items are never items themselves. |
| `never.os` | `/System/**`, `/usr/lib/**`, `/Library/Extensions/**`, `/Library/Apple/**`, `/private/var/vm/**`, `/private/var/folders/**`, `/.Spotlight-V100/**`, `/private/var/MobileAsset/**`, `/Library/Updates/**`, `/Library/Developer/CoreSimulator/Volumes/**`, `/Library/Developer/CoreSimulator/Images/**` | System files, kernel extensions, system libraries, swap/sleepimage, Spotlight index, OS assets and updates, simulator runtime images. |

Note `messages.attachments` (advisory) sits inside `never.personal_data` on purpose: advisories are measured, never deleted.

- [ ] **Step 1: Write the failing lint tests** in `catalog.test.ts`

```ts
it("has unique, well-formed ids", () => {
  const ids = TARGETS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
});
it("gives every safe/review target a relative, non-subtree pattern", () => {
  for (const t of TARGETS.filter((t) => t.safety === "safe" || t.safety === "review")) {
    expect(t.patterns.length).toBeGreaterThan(0);
    for (const p of t.patterns) { expect(p.startsWith("/")).toBe(false); expect(p.endsWith("**")).toBe(false); }
  }
});
it("keeps every deletable sample path out of the never list", () => {
  for (const t of TARGETS.filter((t) => t.safety === "safe" || t.safety === "review"))
    for (const p of t.patterns) expect(findNeverTarget(samplePath(p), "/home/" + samplePath(p).join("/"))).toBeUndefined();
});
it("refuses never paths even where a deletable pattern would match", () => {
  expect(findDeletableTarget(["Library", "Caches", "com.apple.bird"])).toBeDefined(); // matches caches.apple…
  expect(findNeverTarget(["Library", "Caches", "com.apple.bird"], "/h/Library/Caches/com.apple.bird")?.id).toBe("never.identity_sync"); // …but never wins in policy
});
it("documents every cleanup scanner", () => {
  const owned = new Set(TARGETS.map((t) => t.ownedBy).filter(Boolean));
  for (const id of ["npm_cache","yarn_cache","pnpm_cache","brew_cache","xcode_derived_data","xcode_archives",
    "simulator_caches","docker_unused","cocoapods_cache","gradle_cache","pip_cache","cargo_cache"]) expect(owned.has(id)).toBe(true);
});
it("has every required i18n key in en and pt, and at least one source", () => {
  for (const t of TARGETS) {
    const fields = t.safety === "never" ? ["label","why"] : t.safety === "advisory" ? ["label","why","impact"] : ["label","why","regen","impact"];
    for (const loc of [en, pt]) for (const f of fields) expect(loc[`sd.${t.id}.${f}`], `${t.id}.${f}`).toBeTruthy();
    expect(t.sources.length).toBeGreaterThan(0);
  }
});
it("only uses commands on advisories", () => {
  for (const t of TARGETS) if (t.commands) expect(t.safety).toBe("advisory");
});
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/catalog.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `catalog.ts`** from the tables above, and add the locale strings (en + pt). `sources` per target: the Task 1 source URL(s) that back the row; `"https://github.com/MiguelBizzi/bizzi-mac-cleaner/blob/main/docs/system-data/README.md#verification-log"` where the evidence is our own verification.
- [ ] **Step 4: Run** `npx vitest run src/systemData src/core/i18n.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(system-data): encode the System Data taxonomy catalog`

---

### Task 5: Delete policy derived from the catalog

**Files:**
- Modify: `src/core/deletePolicy.ts`
- Test: `src/core/deletePolicy.test.ts`

**Interfaces:**
- Consumes: `findDeletableTarget`, `findNeverTarget`, `targetById` (Task 4); `currentMacOS`, `inRange`, `supportLevel` (Task 2); `relSegments` (Task 3); `pathsToAudit` (`src/core/paths.ts`).
- Produces: `categoryViolation(category, target, root)` unchanged signature, new behaviour:
  1. For **every** category, for each path in `pathsToAudit(target)`: if `findNeverTarget(rel, absolute)` → `` `"<label>" is never removed: <why>` `` using the en strings `sd.<id>.label` / `sd.<id>.why` (the refusal is shown in the failure list).
  2. Category `system_data`: both the lexical and the real path must `findDeletableTarget` the **same** target id; the target's `macos` range must include `currentMacOS()`; `supportLevel` must not be `"unsupported"`. Otherwise refuse with a reason naming which check failed.
  3. `system_caches_logs` rules and `SYSTEM_CACHE_RULES` are removed; `RULES.system_caches_logs` no longer exists (unknown category → refused, as today).

- [ ] **Step 1: Write the failing tests**

```ts
beforeEach(() => setMacOSForTests({ major: 27, minor: 0, patch: 0 }));
it("allows catalog targets under system_data", () => {
  expect(categoryViolation("system_data", "/h/Library/Caches/com.tinyspeck.slackmacgap", "/h")).toBeNull();
  expect(categoryViolation("system_data", "/h/Library/Developer/Xcode/iOS DeviceSupport/iPhone15,2 17.1 (21B80)", "/h")).toBeNull();
});
it("refuses never targets for every category", () => {
  expect(categoryViolation("system_data", "/h/Library/Caches/com.apple.bird", "/h")).toMatch(/never removed/);
  expect(categoryViolation("node_modules", "/h/Library/Mobile Documents/com~apple~CloudDocs/app/node_modules", "/h")).toMatch(/never removed/);
});
it("refuses parents of cleanable items", () => {
  expect(categoryViolation("system_data", "/h/Library/Caches", "/h")).not.toBeNull();
  expect(categoryViolation("system_data", "/h/Library/Application Support/MobileSync/Backup", "/h")).not.toBeNull();
});
it("refuses a catalog path whose real location is elsewhere", () => {
  vol.fromJSON({ "/h/Documents/taxes/a.pdf": "x" });
  vol.mkdirSync("/h/Library", { recursive: true });
  vol.symlinkSync("/h/Documents", "/h/Library/Caches");
  expect(categoryViolation("system_data", "/h/Library/Caches/taxes", "/h")).not.toBeNull();
});
it("refuses targets outside their macOS range", () => {
  setMacOSForTests({ major: 11, minor: 7, patch: 0 });
  expect(categoryViolation("system_data", "/h/Library/Logs/DiagnosticReports", "/h")).toMatch(/unsupported/);
});
it("no longer knows system_caches_logs", () => {
  expect(categoryViolation("system_caches_logs", "/h/Library/Logs", "/h")).toMatch(/unknown cleanup category/);
});
```

- [ ] **Step 2: Run** `npx vitest run src/core/deletePolicy.test.ts src/core/deleteSafely.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three behaviours above. Rewrite any existing `deleteSafely.test.ts` cases that used `system_caches_logs` to use `system_data`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS except `systemCachesAndLogs.test.ts` items now refused at delete (scanner is removed in Task 7; if that test only scans, it still passes).
- [ ] **Step 5: Commit** `feat(policy): derive system_data rules and never-deny from the catalog`

---

### Task 6: Environment probes

**Files:**
- Create: `src/systemData/probes.ts`, `src/systemData/context.ts`
- Test: `src/systemData/probes.test.ts`, `src/systemData/context.test.ts`

**Interfaces:**
- Consumes: `execCommand` (`src/core/shell/exec.ts`), `allowShellDiscovery` (`src/scanners/helpers.ts`), `currentMacOS`, `supportLevel` (Task 2).
- Produces (`probes.ts`; every function returns the "unknown" value on any error and never throws):
  - `probeFullDiskAccess(home: string): Promise<"granted" | "denied" | "unknown">` — `readdir(home/Library/Safari)`: ok → granted, `EPERM`/`EACCES` → denied, else unknown
  - `runningApps(): Promise<{ names: Set<string>; bundleIds: Set<string> }>` — `/bin/ps -axo comm=` (basename of each line, lower-cased) + `/usr/bin/lsappinfo list` (`bundleID="…"`, lower-cased)
  - `isAppRunning(apps, check: SystemDataTarget["runningCheck"], wildcardValue?: string): boolean` — `bundleIdFolder`: bundleIds has wildcardValue; `folderName`: a name equals it or starts with `"<it> "`; `{names}`: any listed name
  - `plistValue(file: string, key: string): Promise<string | null>` — `/usr/bin/plutil -extract <key> raw -o - <file>`, trimmed
  - `localSnapshots(): Promise<Date[] | null>` — parses `com.apple.TimeMachine.YYYY-MM-DD-HHMMSS.local` lines from `/usr/bin/tmutil listlocalsnapshots /`
  - `simulatorRuntimes(): Promise<Array<{ identifier: string; version: string; sizeBytes: number | null; lastUsedAt: Date | null; deletable: boolean }> | null>` — `/usr/bin/xcrun simctl runtime list -j`
  - `darwinUserDirs(): Promise<string[]>` — `/usr/bin/getconf DARWIN_USER_CACHE_DIR` and `DARWIN_USER_TEMP_DIR`, only paths under `/private/var/folders/` or `/var/folders/`
  - `allocatedBytes(st: { size: number; blocks?: number }): number` — `blocks * 512` when `blocks` is a number, else `size`
- Produces (`context.ts`):
  - `interface SystemDataContext { macos: MacOSVersion | null; support: "unsupported" | "verified" | "unverified"; fda: "granted" | "denied" | "unknown"; apps: { names: Set<string>; bundleIds: Set<string> }; shell: boolean }`
  - `getSystemDataContext(root: string): Promise<SystemDataContext>` — cached per root for the process lifetime; when `!allowShellDiscovery(root)`: `fda: "unknown"`, empty apps, `shell: false`
  - `resetSystemDataContextForTests(): void`

- [ ] **Step 1: Write the failing tests** (mock `execCommand` with canned stdout)

```ts
it("parses local snapshot dates", async () => {
  mockExec("/usr/bin/tmutil", "Snapshots for disk /:\ncom.apple.TimeMachine.2026-11-20-101500.local\ncom.apple.TimeMachine.2026-11-21-090000.local\n");
  expect((await localSnapshots())?.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-11-20", "2026-11-21"]);
});
it("returns null when tmutil fails", async () => { mockExecReject("/usr/bin/tmutil"); expect(await localSnapshots()).toBeNull(); });
it("reads running bundle ids and process names", async () => {
  mockExec("/bin/ps", "/Applications/Slack.app/Contents/MacOS/Slack\n/usr/sbin/cfprefsd\n");
  mockExec("/usr/bin/lsappinfo", '"Slack" ASN:0x0-0x1: \n    bundleID="com.tinyspeck.slackmacgap"\n');
  const apps = await runningApps();
  expect(isAppRunning(apps, "bundleIdFolder", "com.tinyspeck.slackmacgap")).toBe(true);
  expect(isAppRunning(apps, "folderName", "Slack")).toBe(true);
  expect(isAppRunning(apps, "folderName", "Discord")).toBe(false);
});
it("parses simctl runtimes", async () => {
  mockExec("/usr/bin/xcrun", JSON.stringify({ "UUID-1": { identifier: "UUID-1", version: "17.5", sizeBytes: 7_000_000_000, lastUsedAt: "2025-01-02T00:00:00Z", deletable: true } }));
  expect((await simulatorRuntimes())?.[0]).toMatchObject({ version: "17.5", sizeBytes: 7_000_000_000, deletable: true });
});
it("uses allocated blocks for sparse files", () => {
  expect(allocatedBytes({ size: 64e9, blocks: 17_578_125 })).toBe(9e9);
  expect(allocatedBytes({ size: 100 })).toBe(100);
});
it("probes FDA via ~/Library/Safari", async () => { /* readdir throws EPERM */ expect(await probeFullDiskAccess("/h")).toBe("denied"); });
it("never shells out for a fixture root", async () => {
  const ctx = await getSystemDataContext("/tmp/fixture");
  expect(ctx.shell).toBe(false); expect(execCommand).not.toHaveBeenCalled();
});
it("rejects getconf output outside /var/folders", async () => { mockExec("/usr/bin/getconf", "/Users/x/Documents/\n"); expect(await darwinUserDirs()).toEqual([]); });
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/probes.test.ts src/systemData/context.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both files with the signatures above (timeouts: 5 s for `ps`/`lsappinfo`/`getconf`/`plutil`, 15 s for `tmutil`/`xcrun`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(system-data): add FDA, running-app, plist and tool probes`

---

### Task 7: The System Data scanner (deletable targets)

**Files:**
- Create: `src/systemData/scanner.ts`
- Modify: `src/scanners/types.ts`, `src/scanners/index.ts`, `src/locales/*.json`, `SCANNERS.md`
- Delete: `src/scanners/systemCachesAndLogs.ts`, `src/scanners/systemCachesAndLogs.test.ts`
- Test: `src/systemData/scanner.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `CleanupItem` gains `targetId?: string; advisory?: boolean; sizeUnknown?: boolean; note?: string` (`note` is an already-translated short string, e.g. "Slack is running — quit it first").
  - `ScannerId`: add `"system_data"`, remove `"system_caches_logs"`.
  - `systemDataScanner: Scanner` with `id: "system_data"`, `labelKey: "scanners.systemData"`; it replaces `systemCachesAndLogsScanner` in `cacheScanners` at the same position.
  - `scanDeletableTargets(options: ScanOptions, ctx: SystemDataContext): AsyncGenerator<CleanupItem>` (exported for tests).
  - A synthetic item per FDA-gated target that was skipped: `{ advisory: true, sizeUnknown: true, targetId, note: t("sd.needsFda") }` — Task 8's advisory rendering shows it.

Behaviour per target with `safety` `safe|review`, no `ownedBy`:
1. Skip if `!inRange(ctx.macos, t.macos)`.
2. FDA gating: required (or required from `fromMacOS` and `ctx.macos` ≥ it) and `ctx.fda !== "granted"` → emit the needs-FDA item once for the target, do not read the path.
3. `expandPattern(root, pattern, t.exclude)`; drop paths for which `findNeverTarget` hits; drop paths failing `markerAnyOf`; `denied` dirs → the needs-FDA item.
4. Size with `dirSize`; skip `<= 0`.
5. Risk: `safe` → `"safe"`, `review` → `"caution"`; then downgrade to `"caution"` when `ctx.support === "unverified"` or the owning app is running (`note` = `t("sd.appRunning", { app })`).
6. `description`: `t("sd.<id>.label")` + `" · "` + wildcard value when the pattern has one; for `backups.ios`, `"<Device Name> · <Last Backup Date as YYYY-MM-DD>"` via `plistValue(<backup>/Info.plist, …)` when `ctx.shell`, else the folder name.
7. `ctx.support === "unsupported"` → yield nothing here (advisories still run in Task 8).

- [ ] **Step 1: Write the failing tests** (memfs; `ctx` built by hand, no shell)

```ts
const ctx = (over: Partial<SystemDataContext> = {}): SystemDataContext => ({
  macos: { major: 27, minor: 0, patch: 0 }, support: "verified", fda: "granted",
  apps: { names: new Set(), bundleIds: new Set() }, shell: false, ...over });

it("offers app caches as safe and Apple caches as caution, skipping owned and never folders", async () => {
  vol.fromJSON({ "/h/Library/Caches/com.foo/a": "x".repeat(10), "/h/Library/Caches/com.apple.Safari/a": "x",
    "/h/Library/Caches/Homebrew/a": "x", "/h/Library/Caches/com.apple.bird/a": "x", "/h/Library/Caches/TemporaryItems/a": "x" });
  const items = await collect(scanDeletableTargets({ root: "/h", staleDays: 30 }, ctx()));
  expect(items.find((i) => i.path.endsWith("com.foo"))).toMatchObject({ risk: "safe", targetId: "caches.app" });
  expect(items.find((i) => i.path.endsWith("com.apple.Safari"))?.risk).toBe("caution");
  for (const gone of ["Homebrew", "com.apple.bird", "TemporaryItems"]) expect(items.some((i) => i.path.endsWith(gone))).toBe(false);
});
it("downgrades a running app's cache and says why", async () => {
  vol.fromJSON({ "/h/Library/Caches/com.tinyspeck.slackmacgap/a": "x" });
  const items = await collect(scanDeletableTargets({ root: "/h", staleDays: 30 },
    ctx({ apps: { names: new Set(), bundleIds: new Set(["com.tinyspeck.slackmacgap"]) } })));
  expect(items[0]).toMatchObject({ risk: "caution" }); expect(items[0]!.note).toBeTruthy();
});
it("turns every safe target into caution on an unverified macOS", async () => {
  vol.fromJSON({ "/h/Library/Logs/DiagnosticReports/a.ips": "x" });
  const items = await collect(scanDeletableTargets({ root: "/h", staleDays: 30 }, ctx({ macos: { major: 28, minor: 0, patch: 0 }, support: "unverified" })));
  expect(items.every((i) => i.risk === "caution")).toBe(true);
});
it("yields nothing deletable on an unsupported macOS", async () => {
  vol.fromJSON({ "/h/Library/Logs/x/a": "x" });
  expect(await collect(scanDeletableTargets({ root: "/h", staleDays: 30 }, ctx({ support: "unsupported" })))).toEqual([]);
});
it("reports FDA-gated targets instead of reading them", async () => {
  vol.fromJSON({ "/h/Library/Application Support/MobileSync/Backup/abc/Info.plist": "x" });
  const items = await collect(scanDeletableTargets({ root: "/h", staleDays: 30 }, ctx({ fda: "denied" })));
  expect(items.find((i) => i.targetId === "backups.ios")).toMatchObject({ advisory: true, sizeUnknown: true });
});
it("skips container caches without FDA from Sonoma, reads them on Ventura", async () => {
  vol.fromJSON({ "/h/Library/Containers/com.foo/Data/Library/Caches/a": "x" });
  const sonoma = await collect(scanDeletableTargets({ root: "/h", staleDays: 30 }, ctx({ macos: { major: 14, minor: 0, patch: 0 }, fda: "denied" })));
  expect(sonoma.find((i) => i.targetId === "caches.container")?.advisory).toBe(true);
  const ventura = await collect(scanDeletableTargets({ root: "/h", staleDays: 30 }, ctx({ macos: { major: 13, minor: 6, patch: 0 }, fda: "denied" })));
  expect(ventura.find((i) => i.targetId === "caches.container")?.advisory).toBeFalsy();
});
it("only offers Chromium caches inside a real userData dir", async () => {
  vol.fromJSON({ "/h/Library/Application Support/Slack/Local State": "{}", "/h/Library/Application Support/Slack/Cache/a": "x",
    "/h/Library/Application Support/MyNotes/Cache/real-data.db": "x" });
  const items = await collect(scanDeletableTargets({ root: "/h", staleDays: 30 }, ctx()));
  expect(items.some((i) => i.path.includes("Slack/Cache"))).toBe(true);
  expect(items.some((i) => i.path.includes("MyNotes"))).toBe(false);
});
it("every yielded path passes the delete policy", async () => { /* scan a fixture holding one sample per deletable pattern;
   for each non-advisory item expect(categoryViolation("system_data", item.path, "/h")).toBeNull() */ });
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/scanner.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `scanner.ts`, swap the registry entry, delete the old scanner + test, rename locale key `scanners.systemCachesAndLogs` → `scanners.systemData` ("System Data" / "Dados do Sistema"), add `sd.needsFda`, `sd.appRunning`, and update the `SCANNERS.md` row.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(system-data): catalog-driven System Data scanner replaces system_caches_logs`

---

### Task 8: Advisory items and non-selectable rows

**Files:**
- Create: `src/systemData/advisories.ts`
- Modify: `src/systemData/scanner.ts` (call advisories after deletable targets), `src/core/selection.ts`
- Test: `src/systemData/advisories.test.ts`, `src/core/selection.test.ts`

**Interfaces:**
- Consumes: probes (Task 6), `allocatedBytes`, `dirSize`, `itemId`.
- Produces:
  - `scanAdvisories(options: ScanOptions, ctx: SystemDataContext): AsyncGenerator<CleanupItem>` — every item has `advisory: true`, `category: "system_data"`, `risk: "caution"`, `targetId`.
  - `isSelectable(item: CleanupItem): boolean` in `selection.ts` (`!item.advisory`); `toggleId`, `selectAllInCategory`, `toggleAll`, `selectedItems` ignore non-selectable items. `toggleId` gains a third parameter `items: CleanupItem[]` so it can check selectability — update the one call site in `ScanScreen.tsx`.

| targetId | Emitted when | sizeBytes | description / note |
|---|---|---|---|
| `snapshots.tm_local` | `ctx.shell` and `localSnapshots()` non-empty | 0, `sizeUnknown` | note: `t("sd.snapshots.count", { count, oldest })` |
| `dev.simulator_runtimes` | `ctx.shell` and runtimes non-null | sum of known `sizeBytes`; `sizeUnknown` if any null | one item per runtime: `"iOS <version>"`, note last used date |
| `vm.docker_raw` | the file exists (lstat) | `allocatedBytes(lstat)` | — |
| `vm.colima`, `ai.ollama`, `dev.go_modcache`, `messages.attachments` | dir exists (respect `fda` gating as in Task 7) | `dirSize` | — |
| `ai.apple_intelligence` | `inRange(ctx.macos, {min:"15.1"})` | 0, `sizeUnknown` | — |
| `sys.var_folders` | `ctx.shell` | sum of `dirSize` over `darwinUserDirs()` | — |

Advisory paths may lie outside the scan root (`sys.var_folders`); they are never deletable, so the `isInsideRoot` filter does not apply to them.

- [ ] **Step 1: Write the failing tests**

```ts
it("reports Docker.raw by allocated size", async () => {
  vol.fromJSON({ "/h/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw": "" });
  vi.spyOn(fsp, "lstat").mockResolvedValueOnce({ size: 64e9, blocks: 17_578_125, mtime: new Date(), isDirectory: () => false } as never);
  const items = await collect(scanAdvisories({ root: "/h", staleDays: 30 }, ctx()));
  expect(items.find((i) => i.targetId === "vm.docker_raw")).toMatchObject({ advisory: true, sizeBytes: 9e9 });
});
it("emits Apple Intelligence only from 15.1", async () => {
  const at = async (minor: number) => (await collect(scanAdvisories({ root: "/h", staleDays: 30 }, ctx({ macos: { major: 15, minor, patch: 0 } }))))
    .some((i) => i.targetId === "ai.apple_intelligence");
  expect(await at(0)).toBe(false); expect(await at(1)).toBe(true);
});
it("emits nothing that needs a shell for a fixture root", async () => {
  const items = await collect(scanAdvisories({ root: "/tmp/f", staleDays: 30 }, ctx({ shell: false })));
  expect(items.some((i) => ["snapshots.tm_local", "dev.simulator_runtimes", "sys.var_folders"].includes(i.targetId!))).toBe(false);
});
// selection.test.ts
it("never selects advisory items", () => {
  const items = [item({ id: "a" }), item({ id: "b", advisory: true })];
  expect([...toggleAll(items, new Set())]).toEqual(["a"]);
  expect(toggleId(new Set(), "b", items).size).toBe(0);
});
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/advisories.test.ts src/core/selection.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `advisories.ts`, wire into the scanner, update `selection.ts` and its call sites; add the `sd.snapshots.count` strings.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(system-data): advisory items for snapshots, VMs, runtimes and OS-managed data`

---

### Task 9: Delete-time preflight

**Files:**
- Create: `src/systemData/preflight.ts`
- Modify: `src/core/deleteItems.ts`
- Test: `src/systemData/preflight.test.ts`, `src/core/deleteItems.test.ts`

**Interfaces:**
- Consumes: `targetById`, `runningApps`, `isAppRunning`, `firstWildcardValue`, `relSegments`, `statSafe`.
- Produces: `systemDataPreflight(item: CleanupItem, root: string): Promise<string | null>` — returns a translated refusal or null. Checks, in order: `item.advisory` → refuse (`sd.preflight.advisory`); path no longer exists → refuse (`sd.preflight.gone`); path changed from directory to non-directory or vice versa since scan (scan items for directory patterns must still be directories) → refuse (`sd.preflight.changed`); target has `runningCheck` and the app is running now → refuse (`sd.preflight.running`, with app). `runningApps()` is called once per batch, not per item — `deleteItems` passes a memoised getter, so the actual signature is `systemDataPreflight(item, root, apps: () => Promise<RunningApps>)`.
- `deleteItems.runBatch`: for `item.category === "system_data"`, call preflight first; a refusal becomes a `DeleteFailure` without calling `deleteSafely`.

- [ ] **Step 1: Write the failing tests**

```ts
it("refuses when the owning app started after the scan", async () => {
  vol.fromJSON({ "/h/Library/Caches/com.tinyspeck.slackmacgap/a": "x" });
  const it = item({ category: "system_data", targetId: "caches.app", path: "/h/Library/Caches/com.tinyspeck.slackmacgap" });
  const apps = async () => ({ names: new Set<string>(), bundleIds: new Set(["com.tinyspeck.slackmacgap"]) });
  expect(await systemDataPreflight(it, "/h", apps)).toMatch(/running/i);
});
it("refuses advisory items even if forced into a batch", async () => {
  expect(await systemDataPreflight(item({ category: "system_data", advisory: true, targetId: "vm.docker_raw" }), "/h", noApps)).not.toBeNull();
});
it("refuses a path that vanished", async () => {
  expect(await systemDataPreflight(item({ category: "system_data", targetId: "logs.user", path: "/h/Library/Logs/gone" }), "/h", noApps)).not.toBeNull();
});
// deleteItems.test.ts
it("does not call trash for a preflight refusal", async () => { /* trash mock not called; result.failed has the item */ });
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/preflight.test.ts src/core/deleteItems.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** preflight and the `runBatch` hook; add `sd.preflight.*` strings.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(system-data): re-check running apps and path state before trashing`

---

### Task 10: TUI — System Data screen, explanations, honest confirmation

**Files:**
- Create: `src/systemData/explain.ts`, `src/screens/SystemDataHeader.tsx`
- Modify: `src/screens/MainMenu.tsx`, `src/app.tsx`, `src/screens/ScanScreen.tsx`, `src/screens/ConfirmDeleteModal.tsx`, `src/core/scanCache.ts`, `src/core/selection.ts`, `src/locales/*.json`
- Test: `src/systemData/explain.test.ts`, `src/core/selection.test.ts`, `src/core/i18n.test.ts`

**Interfaces:**
- Consumes: `targetById`, `getSystemDataContext`, `isSelectable`.
- Produces:
  - `explainItem(item: CleanupItem): { title: string; group: string; safety: string; safetyDef: string; why: string; regen?: string; impact?: string; commands?: string[]; path: string } | null` — null when `item.targetId` is missing.
  - `summarizeSystemData(items: CleanupItem[]): { reclaimableBytes: number; reviewBytes: number; advisoryBytes: number; advisoryCount: number; needsFdaCount: number }`.
  - `needsExtraConfirm(items: CleanupItem[]): boolean` in `selection.ts` — true when `dockerOrArchives(items)` or any item is `system_data` with `risk === "caution"`; `ConfirmDeleteModal` uses it in place of `dockerOrArchives`.
  - `confirmImpacts(items: CleanupItem[]): string[]` in `explain.ts` — distinct `sd.<id>.impact` strings of the `caution` items, in first-seen order.
  - `ScanCacheId` gains `"systemData"`.
  - `ScanScreen` gains prop `header?: React.ReactNode`.

UI behaviour:
- Main menu: "System Data" entry directly under "Scan Caches" → `<ScanScreen scanners={[systemDataScanner]} cacheId="systemData" header={<SystemDataHeader …/>} />`.
- Header (two lines): `macOS 27.0.1 · verified` (or `not yet verified — every item needs review` / `unsupported — showing information only`), `Full Disk Access: granted|not granted (N locations hidden)`; then `Reclaimable {safe} · Needs review {review} · Managed by macOS/tools {advisory}`.
- Advisory rows: `dimColor`, checkbox glyph `[i]`, tag `t("sd.safety.advisory")`, size shown as `—` when `sizeUnknown`; `note` printed dim after the row.
- `?` on an item row toggles an explanation box below the list with every field of `explainItem` (commands in a code-style dim block). `?` is added to `scan.hint` in both locales and to the i18n test that documents scan-screen shortcuts.
- Confirm modal: under the path list, "What you'll lose:" followed by `confirmImpacts(items)`; extra confirmation when `needsExtraConfirm`.

- [ ] **Step 1: Write the failing tests**

```ts
it("explains a catalog item with its safety definition", () => {
  const e = explainItem(item({ targetId: "dev.device_support", risk: "caution" }))!;
  expect(e.safety).toBe(t("sd.safety.review")); expect(e.why).toBe(t("sd.dev.device_support.why")); expect(e.regen).toBeTruthy();
});
it("shows commands for advisories", () => {
  expect(explainItem(item({ targetId: "snapshots.tm_local", advisory: true }))!.commands).toContain("tmutil listlocalsnapshots /");
});
it("summarizes reclaimable vs advisory bytes", () => {
  const s = summarizeSystemData([item({ sizeBytes: 10, risk: "safe" }), item({ sizeBytes: 5, risk: "caution" }), item({ sizeBytes: 100, advisory: true })]);
  expect(s).toMatchObject({ reclaimableBytes: 10, reviewBytes: 5, advisoryBytes: 100, advisoryCount: 1 });
});
it("requires extra confirmation for review-level system data", () => {
  expect(needsExtraConfirm([item({ category: "system_data", risk: "caution" })])).toBe(true);
  expect(needsExtraConfirm([item({ category: "system_data", risk: "safe" })])).toBe(false);
});
it("lists distinct impacts for the confirm modal", () => {
  const a = item({ targetId: "web.webkit", risk: "caution" });
  expect(confirmImpacts([a, { ...a, id: "2" }])).toEqual([t("sd.web.webkit.impact")]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/explain.test.ts src/core/selection.test.ts src/core/i18n.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, then the screens.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Manually verify in dry-run** — `npm run dev`, open System Data: header shows macOS 27 and FDA state; `?` explains an item; advisory rows cannot be selected with space or `a`; confirm on a WebKit item shows "What you'll lose". Record a screenshot path in the commit body.
- [ ] **Step 6: Commit** `feat(tui): System Data screen with explanations and advisory rows`

---

### Task 11: Generated taxonomy and positioning docs

**Files:**
- Create: `src/systemData/docs.ts`, `scripts/generate-system-data-docs.ts`, `docs/system-data/TAXONOMY.md` (generated)
- Modify: `package.json` (script `"docs:system-data": "tsx scripts/generate-system-data-docs.ts"`), `README.md`, `SECURITY.md`, `docs/system-data/README.md` (link to TAXONOMY)
- Test: `src/systemData/docs.test.ts`

**Interfaces:**
- Consumes: `TARGETS`, en locale strings.
- Produces: `renderTaxonomyMarkdown(): string` — deterministic (no dates); one `##` section per `TaxonomyGroup` in the type's declared order, each a table with columns `Target | Location | Safety | macOS | Needs FDA | Why | What regenerates it | Impact of removal | Handled by`; `Location` lists patterns in backticks, `Handled by` is `ownedBy` scanner label or "System Data" or "macOS / owning tool" for advisories or "never touched"; a final "Never touched" section lists every `never` target with its patterns and why.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs"; // real fs — do not mock in this file
it("TAXONOMY.md is in sync with the catalog (run npm run docs:system-data)", () => {
  expect(readFileSync("docs/system-data/TAXONOMY.md", "utf8")).toBe(renderTaxonomyMarkdown());
});
it("lists every target id", () => {
  const md = renderTaxonomyMarkdown();
  for (const target of TARGETS) expect(md).toContain(t(`sd.${target.id}.label`));
});
```

- [ ] **Step 2: Run** `npx vitest run src/systemData/docs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `docs.ts` + script; run `npm run docs:system-data`.
- [ ] **Step 4: Update positioning docs.** README: a "System Data" section near the top — what it cleans, the four safety levels, "never touches" summary, link to `docs/system-data/`. SECURITY.md: add the never-deny rule, Trash-only, no sudo, advisories never execute commands, absolute-path shell-outs. Keep claims to what the code does.
- [ ] **Step 5: Run** `npm test && npx tsc --noEmit && npm run build` — Expected: PASS.
- [ ] **Step 6: Commit** `docs(system-data): generate taxonomy from the catalog and document the safety model`
