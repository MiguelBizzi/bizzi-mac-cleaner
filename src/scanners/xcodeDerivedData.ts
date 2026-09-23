import path from "node:path";
import { yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

/** Xcode build intermediates. Typical path: ~/Library/Developer/Xcode/DerivedData */
export const xcodeDerivedDataScanner: Scanner = {
  id: "xcode_derived_data",
  labelKey: "scanners.xcodeDerivedData",
  async *scan(options) {
    yield* yieldFirstExistingDir(options, {
      category: "xcode_derived_data",
      candidates: [path.join(options.root, "Library", "Developer", "Xcode", "DerivedData")],
      risk: "safe",
      description: "Xcode DerivedData",
    });
  },
};
