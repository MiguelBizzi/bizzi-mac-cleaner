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
  | "system_data"
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
  /** System Data catalog id (e.g. "caches.app") this item came from. */
  targetId?: string;
  /** Synthetic item: informs the user (e.g. needs Full Disk Access); never deletable. */
  advisory?: boolean;
  /** Size could not be measured; sizeBytes is not meaningful. */
  sizeUnknown?: boolean;
  /** Already-translated short note, e.g. "Slack is running — quit it first". */
  note?: string;
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
