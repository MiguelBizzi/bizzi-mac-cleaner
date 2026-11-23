import path from "node:path";
import pLimit from "p-limit";
import { fsp } from "./fs.js";

export interface WalkEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  mtime: Date;
}

export interface WalkOptions {
  /** Directory names to skip entirely (not descended into, not yielded). */
  excludeNames?: Iterable<string>;
  /** If true, yield a directory named `stopAtName` but do not recurse into it. */
  stopAtName?: string;
  /** Return true to skip a directory (not descended into, not yielded). */
  excludeDir?: (name: string) => boolean;
  maxDepth?: number;
  concurrency?: number;
  followSymlinks?: boolean;
  signal?: AbortSignal;
}

const DEFAULT_EXCLUDE = new Set([
  ".Trash",
  ".git",
  "Library",
]);

/**
 * Directories that cannot be listed. Includes file-provider mounts inside
 * CoreSimulator (errno ETIMEDOUT / scandir on `File Provider Storage/.Trash`).
 */
const SKIPPABLE_FS_CODES = new Set([
  "EACCES",
  "EPERM",
  "ENOENT",
  "EIO",
  "ETIMEDOUT",
  "ENOTCONN",
  "ESTALE",
  "ENXIO",
  "ENODEV",
  "ENOTDIR",
  "ECONNRESET",
  "ECONNABORTED",
  "ENETDOWN",
  "ENETUNREACH",
  "EHOSTDOWN",
  "EHOSTUNREACH",
  "ESHUTDOWN",
]);

function isSkippableFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code !== undefined && SKIPPABLE_FS_CODES.has(code);
}

/**
 * Concurrent recursive walker. Does not follow symlinks by default (avoids cycles).
 * Unreadable and vanished entries are skipped.
 */
export async function* walk(root: string, options: WalkOptions = {}): AsyncGenerator<WalkEntry> {
  const exclude = new Set(options.excludeNames ?? DEFAULT_EXCLUDE);
  const concurrency = options.concurrency ?? 16;
  const follow = options.followSymlinks ?? false;
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const limit = pLimit(concurrency);

  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    if (options.signal?.aborted) return;
    const batch = queue.splice(0, concurrency);
    const listings = await Promise.all(
      batch.map(({ dir, depth }) =>
        limit(async () => {
          try {
            const dirents = await fsp.readdir(dir, { withFileTypes: true });
            return { dir, depth, dirents };
          } catch (err) {
            if (isSkippableFsError(err)) return { dir, depth, dirents: [] };
            throw err;
          }
        }),
      ),
    );

    for (const { dir, depth, dirents } of listings) {
      for (const dirent of dirents) {
        if (options.signal?.aborted) return;
        if (exclude.has(dirent.name)) continue;
        if (options.excludeDir && dirent.isDirectory() && options.excludeDir(dirent.name)) continue;

        const full = path.join(dir, dirent.name);
        const isLink = dirent.isSymbolicLink();
        let isDirectory = dirent.isDirectory();
        let size = 0;
        let mtime = new Date(0);

        try {
          const st = follow || !isLink ? await fsp.stat(full) : await fsp.lstat(full);
          isDirectory = st.isDirectory();
          size = st.size;
          mtime = st.mtime;
        } catch (err) {
          if (isSkippableFsError(err)) continue;
          throw err;
        }

        if (isLink && !follow) {
          yield { path: full, name: dirent.name, isDirectory: false, isSymbolicLink: true, size, mtime };
          continue;
        }

        yield {
          path: full,
          name: dirent.name,
          isDirectory,
          isSymbolicLink: isLink,
          size,
          mtime,
        };

        const shouldStop = options.stopAtName && dirent.name === options.stopAtName;
        if (isDirectory && depth + 1 <= maxDepth && !shouldStop) {
          queue.push({ dir: full, depth: depth + 1 });
        }
      }
    }
  }
}
