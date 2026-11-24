# Scanner test checklist

Every scanner ships with a sibling `*.test.ts` that uses `memfs` (no real disk). Shell-out wrappers live under `src/core/shell/` and are tested by mocking `exec.ts`.

| Scanner | File | Tests | Notes |
| --- | --- | --- | --- |
| node_modules | `src/scanners/nodeModules.ts` | `nodeModules.test.ts` | Staleness from project-root mtime, not inside `node_modules` |
| npm cache | `src/scanners/npmCache.ts` | `npmCache.test.ts` | `~/.npm/_cacache`; `npm config get cache` only when root is `$HOME` |
| Yarn cache | `src/scanners/yarnCache.ts` | `yarnCache.test.ts` | |
| pnpm store | `src/scanners/pnpmCache.ts` | `pnpmCache.test.ts` | |
| Homebrew cache | `src/scanners/brewCache.ts` | `brewCache.test.ts` + `core/shell/brew.test.ts` | Verify `brew --cache` / `brew cleanup -n` manually |
| Xcode DerivedData | `src/scanners/xcodeDerivedData.ts` | `xcodeDerivedData.test.ts` | `~/Library/Developer/Xcode/DerivedData` |
| Xcode Archives | `src/scanners/xcodeArchives.ts` | `xcodeArchives.test.ts` | Always `caution` |
| iOS Simulator | `src/scanners/simulatorCaches.ts` | `simulatorCaches.test.ts` + `core/shell/xcrun.test.ts` | `xcrun simctl list devices -j` only on real `$HOME` |
| Docker unused | `src/scanners/dockerUnused.ts` | `dockerUnused.test.ts` + `core/shell/docker.test.ts` | Trashable caches only — never `docker system prune` |
| CocoaPods | `src/scanners/cocoapodsCache.ts` | `cocoapodsCache.test.ts` | |
| Gradle | `src/scanners/gradleCache.ts` | `gradleCache.test.ts` | |
| pip | `src/scanners/pipCache.ts` | `pipCache.test.ts` | |
| Cargo | `src/scanners/cargoCache.ts` | `cargoCache.test.ts` | `registry/cache` + `registry/src` |
| System Data | `src/systemData/scanner.ts` | `src/systemData/scanner.test.ts` | Catalog-driven (`src/systemData/catalog.ts`): safe/review targets only, FDA-gated targets reported as advisories, running apps and unverified macOS downgrade to `caution` |
| Trash | `src/scanners/trashBin.ts` | `trashBin.test.ts` | Emptying Trash is permanent; dry-run still applies |
| Largest files | `src/scanners/largestFiles.ts` | `largestFiles.test.ts` + `core/topN.test.ts` | Live top-N insert |

Adding a scanner: new file under `src/scanners/`, export a `Scanner`, register it in `src/scanners/index.ts`, add `*.test.ts`, tick this table.
