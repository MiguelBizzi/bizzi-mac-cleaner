import path from "node:path";
import { brewCacheDir } from "../core/shell/brew.js";
import { acceptDiscoveredPath, allowShellDiscovery, yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

/** Homebrew download cache. Typical path: ~/Library/Caches/Homebrew */
export const brewCacheScanner: Scanner = {
  id: "brew_cache",
  labelKey: "scanners.brewCache",
  async *scan(options) {
    const discovered = allowShellDiscovery(options.root)
      ? acceptDiscoveredPath(await brewCacheDir(), /homebrew|linuxbrew/i)
      : null;
    yield* yieldFirstExistingDir(options, {
      category: "brew_cache",
      candidates: [
        discovered,
        path.join(options.root, "Library", "Caches", "Homebrew"),
      ],
      risk: "safe",
      description: "Homebrew cache",
    });
  },
};
