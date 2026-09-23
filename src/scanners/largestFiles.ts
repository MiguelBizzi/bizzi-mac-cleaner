import { walk } from "../core/fsWalk.js";
import { itemId } from "../core/paths.js";
import { TopN } from "../core/topN.js";
import type { CleanupItem, Scanner } from "./types.js";

const EXCLUDE = [
  ".Trash",
  ".git",
  "node_modules",
  "Library",
  ".ssh",
  ".gnupg",
  ".aws",
  ".kube",
  "Applications",
  "System",
];

export const largestFilesScanner: Scanner = {
  id: "largest_files",
  labelKey: "scanners.largestFiles",
  async *scan(options) {
    const n = options.largestFilesCount ?? 100;
    const heap = new TopN<CleanupItem>(n, (item) => item.sizeBytes);
    for await (const entry of walk(options.root, {
      excludeNames: EXCLUDE,
      followSymlinks: false,
      signal: options.signal,
    })) {
      if (entry.isDirectory || entry.isSymbolicLink) continue;
      if (heap.size >= n && entry.size <= heap.minScore) continue;
      const item: CleanupItem = {
        id: itemId("largest_files", entry.path),
        category: "largest_files",
        path: entry.path,
        sizeBytes: entry.size,
        lastModified: entry.mtime,
        risk: "caution",
      };
      heap.push(item);
      yield item;
    }
  },
};
