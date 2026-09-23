import path from "node:path";
import { yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

/** Packaged .xcarchive builds. People often keep these on purpose — always caution. */
export const xcodeArchivesScanner: Scanner = {
  id: "xcode_archives",
  labelKey: "scanners.xcodeArchives",
  async *scan(options) {
    yield* yieldFirstExistingDir(options, {
      category: "xcode_archives",
      candidates: [path.join(options.root, "Library", "Developer", "Xcode", "Archives")],
      risk: "caution",
      description: "Xcode Archives",
    });
  },
};
