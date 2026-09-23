import os from "node:os";
import path from "node:path";
import { dirSize } from "../core/dirSize.js";
import { isInsideRoot, itemId, pathExists, statSafe } from "../core/paths.js";
import type { CleanupItem, Risk, ScanOptions, ScannerId } from "./types.js";

export async function* yieldFirstExistingDir(
  options: ScanOptions,
  params: {
    category: ScannerId;
    candidates: Array<string | null | undefined>;
    risk: Risk;
    description?: string;
  },
): AsyncGenerator<CleanupItem> {
  for (const candidate of params.candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (!isInsideRoot(resolved, options.root)) continue;
    if (!(await pathExists(resolved))) continue;
    const st = await statSafe(resolved);
    if (!st) continue;
    const sizeBytes = st.isDirectory ? await dirSize(resolved, options.signal) : st.size;
    if (sizeBytes <= 0) continue;
    yield {
      id: itemId(params.category, resolved),
      category: params.category,
      path: resolved,
      sizeBytes,
      lastModified: st.mtime,
      description: params.description,
      risk: params.risk,
    };
    return;
  }
}

export async function* yieldEachExistingDir(
  options: ScanOptions,
  params: {
    category: ScannerId;
    candidates: Array<string | null | undefined>;
    risk: Risk;
    describe?: (p: string) => string | undefined;
  },
): AsyncGenerator<CleanupItem> {
  const seen = new Set<string>();
  for (const candidate of params.candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (!isInsideRoot(resolved, options.root)) continue;
    if (!(await pathExists(resolved))) continue;
    const st = await statSafe(resolved);
    if (!st) continue;
    const sizeBytes = st.isDirectory ? await dirSize(resolved, options.signal) : st.size;
    if (sizeBytes <= 0) continue;
    yield {
      id: itemId(params.category, resolved),
      category: params.category,
      path: resolved,
      sizeBytes,
      lastModified: st.mtime,
      description: params.describe?.(resolved),
      risk: params.risk,
    };
  }
}

/** Only consult shell-discovered paths when scanning the real home directory. */
export function allowShellDiscovery(root: string): boolean {
  return path.resolve(root) === path.resolve(os.homedir());
}

/**
 * Drop a path returned by `brew --cache` / `npm config get cache` / etc. unless
 * it looks like that tool's cache. Prevents a hijacked binary from pointing the
 * scanner at Documents, SSH keys, or other user data.
 */
export function acceptDiscoveredPath(
  discovered: string | null | undefined,
  hint: RegExp,
): string | null {
  if (!discovered) return null;
  const resolved = path.resolve(discovered);
  return hint.test(resolved) ? resolved : null;
}
