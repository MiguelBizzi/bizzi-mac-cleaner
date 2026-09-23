import path from "node:path";
import { fsp } from "../core/fs.js";
import { yieldEachExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

/** Folders already reported by dedicated scanners — skip to avoid double-counting. */
const OWNED_CACHE_NAMES = new Set([
  "Homebrew",
  "CocoaPods",
  "pip",
  "Yarn",
  "com.docker.docker",
  "Docker Desktop",
]);

/** Rebuildable junk that does not hold site logins. */
const EXTRA_MAC_CACHES = [
  ["Library", "Logs"],
  ["Library", "Safari", "Favicon Cache"],
];

/**
 * Website data / device support — deleting these can sign the user out of
 * Safari and other WebKit apps, or force large Xcode re-downloads.
 */
const CAUTION_MAC_CACHES = [
  ["Library", "HTTPStorages"],
  ["Library", "WebKit"],
  ["Library", "Developer", "Xcode", "iOS DeviceSupport"],
  ["Library", "Developer", "Xcode", "watchOS DeviceSupport"],
  ["Library", "Developer", "Xcode", "tvOS DeviceSupport"],
  ["Library", "Developer", "Xcode", "UserData", "Previews"],
];

export const systemCachesAndLogsScanner: Scanner = {
  id: "system_caches_logs",
  labelKey: "scanners.systemCachesAndLogs",
  async *scan(options) {
    const safe: string[] = [];
    const caution: string[] = [];
    const cachesRoot = path.join(options.root, "Library", "Caches");
    try {
      for (const name of await fsp.readdir(cachesRoot)) {
        if (OWNED_CACHE_NAMES.has(name)) continue;
        const full = path.join(cachesRoot, name);
        (name.startsWith("com.apple.") ? caution : safe).push(full);
      }
    } catch {
      // missing Library/Caches is fine
    }
    for (const segs of EXTRA_MAC_CACHES) safe.push(path.join(options.root, ...segs));
    for (const segs of CAUTION_MAC_CACHES) caution.push(path.join(options.root, ...segs));

    const describe = (p: string) => path.basename(p);
    yield* yieldEachExistingDir(options, {
      category: "system_caches_logs",
      candidates: safe,
      risk: "safe",
      describe,
    });
    yield* yieldEachExistingDir(options, {
      category: "system_caches_logs",
      candidates: caution,
      risk: "caution",
      describe,
    });
  },
};
