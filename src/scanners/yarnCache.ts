import path from "node:path";
import { yarnCacheDir } from "../core/shell/packageManagers.js";
import { acceptDiscoveredPath, allowShellDiscovery, yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

export const yarnCacheScanner: Scanner = {
  id: "yarn_cache",
  labelKey: "scanners.yarnCache",
  async *scan(options) {
    const discovered = allowShellDiscovery(options.root)
      ? acceptDiscoveredPath(await yarnCacheDir(), /yarn/i)
      : null;
    yield* yieldFirstExistingDir(options, {
      category: "yarn_cache",
      candidates: [
        discovered,
        path.join(options.root, "Library", "Caches", "Yarn"),
        path.join(options.root, ".yarn", "berry", "cache"),
        path.join(options.root, ".cache", "yarn"),
      ],
      risk: "safe",
      description: "Yarn cache",
    });
  },
};
