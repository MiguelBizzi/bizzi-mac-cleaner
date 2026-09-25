import path from "node:path";
import { dirSize } from "../core/dirSize.js";
import { daysAgo } from "../core/format.js";
import { walk } from "../core/fsWalk.js";
import { loadNative, streamNativeScan, type NodeModuleHit } from "../core/nativeWalk.js";
import { itemId, statSafe } from "../core/paths.js";
import type { CleanupItem, Scanner } from "./types.js";

const EXCLUDE = [
  ".Trash",
  ".git",
  "Library",
  ".npm",
  ".cache",
  ".local",
  "Pictures",
  "Movies",
  "Music",
  "Applications",
  "System",
];

async function projectActivityMtime(projectRoot: string): Promise<Date> {
  let latest = new Date(0);
  for (const candidate of [
    path.join(projectRoot, "package.json"),
    path.join(projectRoot, ".git", "HEAD"),
    projectRoot,
  ]) {
    const st = await statSafe(candidate);
    if (st && st.mtime > latest) latest = st.mtime;
  }
  return latest;
}

export const nodeModulesScanner: Scanner = {
  id: "node_modules",
  labelKey: "scanners.nodeModules",
  async *scan(options) {
    const native = loadNative();
    if (native) {
      for await (const hit of streamNativeScan<NodeModuleHit>(native, options.signal, (onItem, abort) =>
        native.scanNodeModules(
          options.root,
          options.staleDays,
          (_err, hit) => onItem(hit),
          abort,
        ),
      )) {
        const item: CleanupItem = {
          id: itemId("node_modules", hit.path),
          category: "node_modules",
          path: hit.path,
          sizeBytes: hit.sizeBytes,
          lastModified: new Date(hit.mtimeMs),
          description: path.basename(path.dirname(hit.path)),
          risk: hit.stale ? "safe" : "caution",
          stale: hit.stale,
        };
        yield item;
      }
      return;
    }
    for await (const entry of walk(options.root, {
      excludeNames: EXCLUDE,
      stopAtName: "node_modules",
      signal: options.signal,
    })) {
      if (entry.name !== "node_modules" || !entry.isDirectory) continue;
      const projectRoot = path.dirname(entry.path);
      const activity = await projectActivityMtime(projectRoot);
      const stale = daysAgo(activity) >= options.staleDays;
      const sizeBytes = await dirSize(entry.path, options.signal);
      if (sizeBytes <= 0) continue;
      const item: CleanupItem = {
        id: itemId("node_modules", entry.path),
        category: "node_modules",
        path: entry.path,
        sizeBytes,
        lastModified: activity,
        description: path.basename(projectRoot),
        risk: stale ? "safe" : "caution",
        stale,
      };
      yield item;
    }
  },
};
