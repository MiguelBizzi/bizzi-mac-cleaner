import path from "node:path";
import { npmCacheDir } from "../core/shell/packageManagers.js";
import { acceptDiscoveredPath, allowShellDiscovery, yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

export const npmCacheScanner: Scanner = {
  id: "npm_cache",
  labelKey: "scanners.npmCache",
  async *scan(options) {
    const discovered = allowShellDiscovery(options.root)
      ? acceptDiscoveredPath(await npmCacheDir(), /npm|_cacache/i)
      : null;
    yield* yieldFirstExistingDir(options, {
      category: "npm_cache",
      candidates: [
        discovered ? path.join(discovered, "_cacache") : null,
        discovered,
        path.join(options.root, ".npm", "_cacache"),
        path.join(options.root, ".npm"),
      ],
      risk: "safe",
      description: "npm _cacache",
    });
  },
};
