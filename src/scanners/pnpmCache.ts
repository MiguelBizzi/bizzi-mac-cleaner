import path from "node:path";
import { pnpmStorePath } from "../core/shell/packageManagers.js";
import { acceptDiscoveredPath, allowShellDiscovery, yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

export const pnpmCacheScanner: Scanner = {
  id: "pnpm_cache",
  labelKey: "scanners.pnpmCache",
  async *scan(options) {
    const discovered = allowShellDiscovery(options.root)
      ? acceptDiscoveredPath(await pnpmStorePath(), /pnpm/i)
      : null;
    yield* yieldFirstExistingDir(options, {
      category: "pnpm_cache",
      candidates: [
        discovered,
        path.join(options.root, "Library", "pnpm", "store"),
        path.join(options.root, ".local", "share", "pnpm", "store"),
        path.join(options.root, ".pnpm-store"),
      ],
      risk: "safe",
      description: "pnpm store",
    });
  },
};
