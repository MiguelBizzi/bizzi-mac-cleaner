import type { CleanupItem } from "../scanners/types.js";

export type ScanCacheId = "scan" | "nodeModules" | "largest";

export interface ScanSnapshot {
  items: CleanupItem[];
  done: boolean;
  root: string;
  staleDays: number;
  largestFilesCount?: number;
}

export interface ScanParams {
  root: string;
  staleDays: number;
  largestFilesCount?: number;
}

/** True when a previous completed scan can be shown instead of scanning again. */
export function isReusableScan(snapshot: ScanSnapshot | undefined, params: ScanParams): boolean {
  if (!snapshot?.done) return false;
  if (snapshot.root !== params.root) return false;
  if (snapshot.staleDays !== params.staleDays) return false;
  if (
    params.largestFilesCount !== undefined &&
    snapshot.largestFilesCount !== params.largestFilesCount
  ) {
    return false;
  }
  return true;
}
