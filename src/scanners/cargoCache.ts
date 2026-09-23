import path from "node:path";
import { yieldEachExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

export const cargoCacheScanner: Scanner = {
  id: "cargo_cache",
  labelKey: "scanners.cargoCache",
  async *scan(options) {
    const registry = path.join(options.root, ".cargo", "registry");
    yield* yieldEachExistingDir(options, {
      category: "cargo_cache",
      candidates: [path.join(registry, "cache"), path.join(registry, "src")],
      risk: "safe",
      describe: (p) => `Cargo ${path.basename(p)}`,
    });
  },
};
