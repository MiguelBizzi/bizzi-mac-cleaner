/**
 * Shared scanner contract. Every scanner is a self-contained module that
 * streams {@link CleanupItem}s as they are discovered so the TUI can render
 * a live running total instead of blocking on a full scan.
 */

export type ScannerId =
  | "node_modules"
  | "npm_cache"
  | "yarn_cache"
  | "pnpm_cache"
  | "brew_cache"
  | "xcode_derived_data"
  | "xcode_archives"
  | "simulator_caches"
  | "docker_unused"
  | "cocoapods_cache"
  | "gradle_cache"
  | "pip_cache"
  | "cargo_cache"
  | "system_caches_logs"
  | "trash_bin"
  | "largest_files";

export type Risk = "safe" | "caution";

export interface ScanOptions {
  /** Resolved scan root. Never read process.env.HOME / os.homedir() in scanners. */
  root: string;
  /** Days without project-root activity before node_modules is flagged stale. */
  staleDays: number;
  /** Cap for the largest-files scanner. */
  largestFilesCount?: number;
  signal?: AbortSignal;
}

export interface CleanupItem {
  id: string;
  category: ScannerId;
  path: string;
  sizeBytes: number;
  lastModified: Date;
  description?: string;
  risk: Risk;
  /** True when the project root looks untouched for `staleDays` or more. */
  stale?: boolean;
}

/**
 * A disk-space scanner. `scan` must be an async generator: yield each item
 * as soon as its size is known. Skip missing paths silently.
 */
export interface Scanner {
  id: ScannerId;
  /** i18n key for the category label shown in the TUI. */
  labelKey: string;
  scan(options: ScanOptions): AsyncGenerator<CleanupItem>;
}
