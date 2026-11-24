import { brewCacheScanner } from "./brewCache.js";
import { cargoCacheScanner } from "./cargoCache.js";
import { cocoapodsCacheScanner } from "./cocoapodsCache.js";
import { dockerUnusedScanner } from "./dockerUnused.js";
import { gradleCacheScanner } from "./gradleCache.js";
import { largestFilesScanner } from "./largestFiles.js";
import { nodeModulesScanner } from "./nodeModules.js";
import { npmCacheScanner } from "./npmCache.js";
import { pipCacheScanner } from "./pipCache.js";
import { pnpmCacheScanner } from "./pnpmCache.js";
import { simulatorCachesScanner } from "./simulatorCaches.js";
import { systemDataScanner } from "../systemData/scanner.js";
import { trashBinScanner } from "./trashBin.js";
import type { CleanupItem, ScanOptions, Scanner } from "./types.js";
import { xcodeArchivesScanner } from "./xcodeArchives.js";
import { xcodeDerivedDataScanner } from "./xcodeDerivedData.js";
import { yarnCacheScanner } from "./yarnCache.js";

export const cacheScanners: Scanner[] = [
  nodeModulesScanner,
  npmCacheScanner,
  yarnCacheScanner,
  pnpmCacheScanner,
  brewCacheScanner,
  xcodeDerivedDataScanner,
  xcodeArchivesScanner,
  simulatorCachesScanner,
  dockerUnusedScanner,
  cocoapodsCacheScanner,
  gradleCacheScanner,
  pipCacheScanner,
  cargoCacheScanner,
  systemDataScanner,
  trashBinScanner,
];

export const allScanners: Scanner[] = [...cacheScanners, largestFilesScanner];

export { largestFilesScanner, nodeModulesScanner };

export async function* runScanners(
  scanners: Scanner[],
  options: ScanOptions,
): AsyncGenerator<CleanupItem> {
  for (const scanner of scanners) {
    if (options.signal?.aborted) return;
    yield* scanner.scan(options);
  }
}

export function scannerById(id: string): Scanner | undefined {
  return allScanners.find((s) => s.id === id);
}
