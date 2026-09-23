import path from "node:path";
import { yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

/**
 * Reports the size of the user's Trash. Emptying Trash is inherently
 * permanent; deleteSafely still records the action and dry-run still applies.
 * The actual empty is handled as a special case in the delete flow.
 */
export const trashBinScanner: Scanner = {
  id: "trash_bin",
  labelKey: "scanners.trashBin",
  async *scan(options) {
    yield* yieldFirstExistingDir(options, {
      category: "trash_bin",
      candidates: [path.join(options.root, ".Trash")],
      risk: "caution",
      description: "Trash",
    });
  },
};
