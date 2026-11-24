# System Data on macOS: expert guide

This guide explains what macOS calls "System Data", how Bizzi Mac Cleaner decides what is safe to remove, and how we verified the facts the catalog depends on. The catalog in `src/systemData/catalog.ts` encodes this document. The generated, always-in-sync table of every target is in [TAXONOMY.md](./TAXONOMY.md) (`npm run docs:system-data`).

## What "System Data" is

"System Data" is the label macOS Storage settings gives to storage it cannot attribute to a named category such as Apps, Documents or Photos. It is a catch-all. In practice it holds:

- User and system caches (`~/Library/Caches`, per-app containers, Electron/Chromium app caches).
- Logs and crash reports (`~/Library/Logs`).
- APFS local snapshots made by Time Machine.
- iPhone and iPad device backups (`~/Library/Application Support/MobileSync/Backup`).
- Developer artifacts: Xcode DerivedData, archives, device support symbols, simulator runtimes and devices, package manager caches, Android emulator images.
- AI model files: Hugging Face, LM Studio, Ollama, PyTorch Hub, Whisper, and Apple Intelligence assets that macOS manages itself.
- Virtual machine disks (Docker Desktop, Colima).
- Swap and the sleep image (`/private/var/vm`), and per-user temp and cache folders under `/private/var/folders`.
- Purgeable space: caches and snapshots macOS can free by itself when it needs room.

Apple states that when space is needed, macOS clears caches and logs that are safe to delete on its own (see Sources). Our job is to find what is large, explain it, and remove only what is demonstrably regenerable, always through the Trash.

## The safety model

Every target in the catalog has exactly one safety level. These definitions are used word for word in code and docs.

- **safe**: regenerated automatically; removing it costs at most a rebuild/re-download and never loses user data.
- **review**: removal has a visible cost, or loses something that cannot be recreated (sign-outs, large re-downloads, device backups, emulator data). Offered, unselected by default, explained, and never picked by bulk select (`a` / category space): toggle each one yourself.
- **advisory**: reclaimable only through macOS or the owning tool. Shown with size and the official command; never deleted by us.
- **never**: deleting breaks macOS, an app, sync, or destroys user data. Hard-denied for every category.

Design contract for the engine. These rules describe behaviour the shipped engine enforces; the facts it depends on that we could not confirm (for example the macOS version where Apple Intelligence assets start, marked unverified in the catalog) stay hedged in the text and in the generated taxonomy:

1. **The never-deny rule.** A `never` target wins over every allow rule, for every cleanup category. If a path matches both a deletable pattern and a `never` pattern, it is refused.
2. **Trash only.** Deletions go through the Trash (`deleteSafely()` then `trash()`). We never call `fs.rm`, so the user can always put an item back until they empty the Trash.
3. **No sudo.** The tool never asks for or uses administrator rights.
4. **Advisories are displayed, never executed.** For advisory targets we show the size and the owning tool's official command verbatim. We do not run it.
5. **Version awareness.** On a macOS newer than the newest version we verified (27), every `safe` target is offered as `review`. Below macOS 12 only advisories are shown.
6. **Protected locations are skipped, not probed.** Where macOS needs Full Disk Access to read a location, we skip it when access is missing instead of triggering a permission prompt.

## Version matrix

| macOS | Storage settings path | App container data protection | Group container protection | Apple Intelligence assets |
|---|---|---|---|---|
| 12 Monterey | About This Mac › Storage › Manage* | No | No | No |
| 13 Ventura | System Settings › General › Storage* | No | No | No |
| 14 Sonoma | System Settings › General › Storage* | Yes | No | No |
| 15 Sequoia | System Settings › General › Storage | Yes | Yes | Yes*, from 15.1 |
| 26 Tahoe | System Settings › General › Storage* | Yes* | Yes* | Yes* |
| 27 | System Settings › General › Storage* | Yes* | Yes* | Yes (Apple Support 121115) |

Notes:

- Container protection: introduced in WWDC23 "What's new in privacy" (macOS 14). An app needs the user's permission to read another developer's app data container; the same Team ID is exempt.
- Group container protection: introduced in WWDC24 "What's new in privacy" (macOS 15).
- Apple Intelligence on-device assets: Apple's support article (source 12) confirms they take up to 8 GB or 14 GB of on-device storage depending on the Mac and that usage can temporarily exceed this during updates; the macOS 27 page says it requires macOS 27 on M1 or later. The "from 15.1" start is widely reported but we did not verify it from an Apple page. We did not verify that these assets cannot be measured without admin rights; the catalog treats them as advisory because macOS manages them, not because of a measured limit.
- \* Not independently verified. The Storage settings paths (12: About This Mac › Storage › Manage; 13+: System Settings › General › Storage) come from the project brief, not from an Apple page we checked. The 26 protection cells follow from the 14 and 15 introductions and were not tested on a 26 machine. The 14/15 protection columns are sourced to the WWDC sessions (sources 4 and 5).

## What we never touch and why

**Cloud files (`never.cloud_files`).** `Library/Mobile Documents` and `Library/CloudStorage` hold iCloud Drive and file-provider data (Dropbox, OneDrive, Google Drive). These may be the only local copy of a file, or a placeholder tied to a sync engine. Removing them can delete user documents or trigger sync conflicts.

**Identity and sync state (`never.identity_sync`).** Several folders under `Library/Caches` are not caches in the disposable sense: the iCloud sync daemon (`com.apple.bird`), CloudKit, account and authentication services, Family Sharing, HomeKit, and Wallet/PassKit store account, sync and credential-related state. Removing them can sign the user out, force a full resync, or break Wallet and Home. Their location under "Caches" is the reason a generic cache cleaner is dangerous here.

**In-flight data (`never.in_flight`).** `com.apple.nsurlsessiond` holds active background downloads, and `TemporaryItems` can hold documents that are open or autosaved. Removing them can lose in-progress work or abort a download.

**Personal data (`never.personal_data`).** Messages, Mail, Photos, Calendars, Contacts (`AddressBook`), Keychains, Cookies, Accounts and Preferences are user data or settings, not caches. (Messages attachments are shown as an advisory so users can see the size, but they are never deleted by us.)

**Group Containers (`never.group_containers`).** `Library/Group Containers` holds state shared between an app and its extensions, and since macOS 15 it is protected by the system. We do not read or remove it.

**VM and model-store internals (`never.vm_internals`).** Docker Desktop's virtual disk and the Colima VM are single files that contain every image, container and volume; trashing them destroys that data. Ollama stores model data in shared `blobs` and `manifests`: several models can point at the same blob, so deleting files by hand can break models that were not selected. These are managed by `docker`, `colima` and `ollama`, so we only advise their official commands.

**Container roots (`never.roots`).** The parents of cleanable items (`Library`, `Library/Caches`, `Library/Application Support`, `Library/Containers`, the MobileSync folders, and the CoreSimulator `Devices` folder) are never items themselves. Only their children can be offered, one at a time.

**Operating system (`never.os`).** `/System`, `/usr/lib`, kernel extensions, `/Library/Apple`, swap and the sleep image in `/private/var/vm`, `/private/var/folders`, the Spotlight index, `MobileAsset` OS assets, `/Library/Updates`, and the simulator runtime images under `/Library/Developer/CoreSimulator` are owned by macOS or Xcode. Deleting them can make the system unbootable, corrupt Xcode's runtime database, or cause failed updates. For `/private/var/folders`, restarting is the safe way to clear it.

## Sources

Titles and URLs were checked on 2026-11-23. Where a page title differs slightly from the name in our plan, the current title is given.

1. Apple Support, "Free up storage space on Mac": https://support.apple.com/en-us/102624
2. Apple Support, "About Time Machine local snapshots": https://support.apple.com/en-us/102154
3. Apple Support, "Locate and manage backups of your iPhone, iPad, and iPod touch" (the plan called it "Locate backups of your iPhone, iPad, and iPod touch"): https://support.apple.com/en-us/108809
4. Apple Developer, WWDC23 "What's new in privacy" (app container protection): https://developer.apple.com/videos/play/wwdc2023/10053/
5. Apple Developer, WWDC24 "What's new in privacy" (group container protection): https://developer.apple.com/videos/play/wwdc2024/10123/
6. `man tmutil`, `man plutil`, `xcrun simctl help runtime` (local manual pages on macOS 27.0.1).
7. Hugging Face, "Manage `huggingface_hub` cache-system": https://huggingface.co/docs/huggingface_hub/main/en/guides/manage-cache
8. Ollama, "Local FAQ", section "Where are models stored?": https://docs.ollama.com/faq
9. Docker Docs, "FAQs for Docker Desktop for Mac" (disk image location and size; the plan called it "Disk utilization in Docker Desktop"): https://docs.docker.com/desktop/troubleshoot-and-support/faqs/macfaqs/
10. Android Developers, "Create and manage virtual devices": https://developer.android.com/studio/run/managing-avds. For the default `~/.android/avd/` location see the avdmanager reference: https://developer.android.com/tools/avdmanager
11. LM Studio docs, "Import Models" (model folder layout): https://lmstudio.ai/docs/app/advanced/import-model
12. Apple Support, "Get started with the next generation of Apple Intelligence" (storage figures; macOS 27 page): https://support.apple.com/en-us/121115

## Verification log

Machine: macOS 27.0.1 (build 26A434), Xcode 26.1.1. Date: 2026-11-23. All commands were read-only; no delete, thin or prune command was run and no sudo was used. Commands that would read another app's container were deliberately not run, because on macOS 14+ they can show a privacy prompt.

### V1: Other-app container access prompt. doc-verified (not run)

Not run on this machine, to avoid a privacy dialog. From Apple's WWDC23 "What's new in privacy": macOS requires permission before an app reads another developer's app data container (same Team ID exempt). Whether Full Disk Access holders are exempt from the prompt was not verified from an Apple source, so we make no claim about it. WWDC24 "What's new in privacy" extends this to group containers. Version boundaries used by the catalog: containers 14+, group containers 15+. A precise "which exact process triggers the prompt from Terminal" test was not performed.

### V2: `plutil -extract ... raw`. verified, with a caveat on dates

```
$ plutil -extract CFBundleName raw -o - /System/Applications/Notes.app/Contents/Info.plist
Notes
```

`man plutil` documents `-extract keypath fmt`, the `raw` format, and says a date value is printed as "the RFC3339-encoded string representation in UTC time zone". So dates are RFC 3339 in UTC (which is the ISO-8601 profile we need); we did not run it against a real date key in a plist.

### V3: `tmutil` local snapshots. partly verified

```
$ tmutil listlocalsnapshots /
Snapshots for disk /:
```

It ran as a normal user, exit 0, and this Mac currently has no local snapshots. `man tmutil` says "Several, but not all, verbs require root and Full Disk Access privileges"; the `deletelocalsnapshots` entry itself does not state a requirement, so we could not confirm from the manual that it needs admin. The catalog's advisory shows `sudo tmutil deletelocalsnapshots <date>` as a conservative display only (never executed by us). Apple's page says local snapshots are deleted automatically as they age or when space is needed, and that macOS 13+ users can clear them by setting Backup Frequency to Manually, waiting, and turning it back on.

### V4: `xcrun simctl runtime list -j`. partly verified

```
$ xcrun simctl runtime list -j
{

}
$ xcrun simctl runtime list
== Disk Images ==

Total Disk Images: 0 (0.0G)
```

The command exists and returns JSON, but this Mac has no runtimes installed, so the per-runtime fields (`identifier`, `version`, `sizeBytes`, `lastUsedAt`, `deletable`) were not observed. `xcrun simctl help runtime` confirms `list [-v] [-j | --json]` and `delete (<identifier>|--notUsedSinceDays <days>) [--dry-run]`. Parsers must treat every field as optional and an empty object as valid.

### V5: Docker Desktop disk file. doc-verified (not run)

Docker Desktop's CLI is installed (`docker --version`: 24.0.7) but the path lives inside `~/Library/Containers/com.docker.docker`, so we did not `ls`, `du` or `stat` it. The Docker Desktop for Mac FAQ gives the location `~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`, states that many tools report the maximum file size rather than the actual size, and shows `ls -klsh Docker.raw` for real usage (example: about 2.2 GB used of a 64 GB maximum). So the file is sparse in effect: allocated bytes are far below the apparent size. Whether `stat` on it prompts was not tested; the catalog treats it as FDA-protected from macOS 14 (`fda: { fromMacOS: "14" }`; without FDA the app shows a needs-Full-Disk-Access row instead of reading it) and measures allocated bytes only when access is already available.

### V6: `lsappinfo list`. verified

```
$ lsappinfo list | grep bundleID
    bundleID="com.apple.loginwindow"
    bundleID="com.apple.WindowManager"
    bundleID=[ NULL ] 
    bundleID="com.google.Chrome"
    bundleID="com.apple.wallpaper.agent"
```

Lines contain `bundleID="..."`. Some entries have `bundleID=[ NULL ]`, so a parser must skip those.

### V7: Full Disk Access probe. verified

```
$ ls ~/Library/Safari
ls: /Users/<me>/Library/Safari: Operation not permitted
$ ls ~/Library/Application\ Support/com.apple.TCC
ls: .../com.apple.TCC: No such file or directory
```

From a terminal without Full Disk Access, `~/Library/Safari` fails with "Operation not permitted", so it works as the FDA probe. `~/Library/Application Support/com.apple.TCC` does not exist on macOS 27, so it cannot be the probe. Note that this result means the terminal that ran it has no FDA; a terminal with FDA would be expected to list the folder.

### V8: LM Studio model location. doc-verified

LM Studio is not installed here (`~/.lmstudio` and `~/.cache/lm-studio` are absent). Verified from docs: LM Studio's "Import Models" page gives `~/.lmstudio/models/<publisher>/<model>/` as the layout. The legacy `~/.cache/lm-studio/models` location comes from secondary guides, not LM Studio's own docs, so it is kept as a best-effort legacy path. Users can change the folder in the app, and those custom locations are not followed.

### Other tools

Ollama: not installed; verified from docs, `~/.ollama/models` on macOS (Ollama Local FAQ). Hugging Face: `~/.cache/huggingface` exists on this Mac; default hub cache `~/.cache/huggingface/hub` per the Hugging Face guide. The `HF_HOME` override is not followed. Android emulator: the default AVD folder `~/.android/avd/` comes from the avdmanager reference; the "Create and manage virtual devices" page itself does not state the path. Apple Intelligence assets are advisory only because macOS manages them; we did not verify whether their size is measurable without admin rights.
