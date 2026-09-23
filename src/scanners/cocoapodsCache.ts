import path from "node:path";
import { yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

export const cocoapodsCacheScanner: Scanner = {
  id: "cocoapods_cache",
  labelKey: "scanners.cocoapodsCache",
  async *scan(options) {
    yield* yieldFirstExistingDir(options, {
      category: "cocoapods_cache",
      candidates: [path.join(options.root, "Library", "Caches", "CocoaPods")],
      risk: "safe",
      description: "CocoaPods cache",
    });
  },
};
