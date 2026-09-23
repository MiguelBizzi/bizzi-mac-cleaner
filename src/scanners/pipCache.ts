import path from "node:path";
import { pipCacheDir } from "../core/shell/packageManagers.js";
import { acceptDiscoveredPath, allowShellDiscovery, yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

export const pipCacheScanner: Scanner = {
  id: "pip_cache",
  labelKey: "scanners.pipCache",
  async *scan(options) {
    const discovered = allowShellDiscovery(options.root)
      ? acceptDiscoveredPath(await pipCacheDir(), /pip/i)
      : null;
    yield* yieldFirstExistingDir(options, {
      category: "pip_cache",
      candidates: [
        discovered,
        path.join(options.root, "Library", "Caches", "pip"),
      ],
      risk: "safe",
      description: "pip cache",
    });
  },
};
