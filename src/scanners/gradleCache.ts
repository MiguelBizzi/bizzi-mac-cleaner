import path from "node:path";
import { yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

export const gradleCacheScanner: Scanner = {
  id: "gradle_cache",
  labelKey: "scanners.gradleCache",
  async *scan(options) {
    yield* yieldFirstExistingDir(options, {
      category: "gradle_cache",
      candidates: [path.join(options.root, ".gradle", "caches")],
      risk: "safe",
      description: "Gradle caches",
    });
  },
};
