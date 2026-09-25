import { walk } from "../core/fsWalk.js";
import { loadNative, streamNativeScan, type LargeFileHit } from "../core/nativeWalk.js";
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
    const native = loadNative();
    if (native) {
      for await (const hit of streamNativeScan<LargeFileHit>(native, options.signal, (onItem, abort) =>
        native.scanLargestFiles(options.root, n, (_err, hit) => onItem(hit), abort),
      )) {
        const item: CleanupItem = {
          id: itemId("largest_files", hit.path),
          category: "largest_files",
          path: hit.path,
          sizeBytes: hit.sizeBytes,
          lastModified: new Date(hit.mtimeMs),
          risk: "caution",
        };
        yield item;
      }
      return;
    }
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
