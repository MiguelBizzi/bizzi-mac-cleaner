import path from "node:path";
import { fsp } from "../core/fs.js";

const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const UUID_SAMPLE = "00000000-0000-0000-0000-000000000000";

/** Path of `target` below `root` as segments; null when `target` is outside `root`. */
export function relSegments(root: string, target: string): string[] | null {
  const rel = path.relative(root, target);
  if (rel === "") return [];
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep);
}

interface Parsed {
  segs: string[];
  /** Pattern ended in "**": it matches the base path and everything under it. */
  subtree: boolean;
}

/**
 * Splits a pattern into segments. A leading "/" (absolute pattern) and any empty
 * segments are dropped, so "/System/**" parses like "System/**": callers match absolute
 * paths by passing the path split on "/" with the leading empty segment removed.
 * Only a trailing "**" is special; elsewhere "**" behaves like "*".
 */
function parse(pattern: string): Parsed {
  const segs = pattern.split("/").filter((s) => s !== "");
  const subtree = segs[segs.length - 1] === "**";
  if (subtree) segs.pop();
  return { segs, subtree };
}

const regexCache = new Map<string, RegExp>();

/** Anchored regex for a segment glob: every char escaped except "*" → "[^/]*". */
function globRegex(glob: string): RegExp {
  let re = regexCache.get(glob);
  if (!re) {
    re = new RegExp(`^${glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
    regexCache.set(glob, re);
  }
  return re;
}

const isWildcard = (seg: string): boolean => seg.includes("*");

function segmentMatches(seg: string, value: string): boolean {
  if (seg === "<uuid>") return UUID_RE.test(value);
  if (!isWildcard(seg)) return seg === value;
  return value !== "" && globRegex(seg).test(value);
}

/** Exact-length match, or prefix match (base path included) when the pattern ends in "**". */
export function matchPattern(pattern: string, rel: string[]): boolean {
  const { segs, subtree } = parse(pattern);
  if (subtree ? rel.length < segs.length : rel.length !== segs.length) return false;
  return segs.every((seg, i) => segmentMatches(seg, rel[i] as string));
}

/** The path segment matched by the pattern's first "*"/glob segment. */
export function firstWildcardValue(pattern: string, rel: string[]): string | undefined {
  const { segs } = parse(pattern);
  const i = segs.findIndex(isWildcard);
  return i === -1 ? undefined : rel[i];
}

/** True when any segment matched by a wildcard in `pattern` matches an `exclude` glob. */
export function excludedBy(pattern: string, rel: string[], exclude: string[] | undefined): boolean {
  if (!exclude?.length) return false;
  const { segs } = parse(pattern);
  return segs.some(
    (seg, i) => isWildcard(seg) && rel[i] !== undefined && exclude.some((ex) => segmentMatches(ex, rel[i] as string)),
  );
}

/** Test helper: a path (segments) that matches `pattern`. */
export function samplePath(pattern: string): string[] {
  return parse(pattern).segs.map((seg) =>
    seg === "<uuid>" ? UUID_SAMPLE : isWildcard(seg) ? seg.replaceAll("*", "sample") : seg,
  );
}

const isDenied = (e: unknown): boolean => {
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EACCES";
};

/**
 * Walks the filesystem for `pattern` below `root` (an absolute pattern walks from "/").
 * Reads one directory per wildcard segment, never recurses beyond the pattern depth, and never
 * follows symlinks at any level (entries are lstat'ed; symlinks are skipped). A trailing "**"
 * yields the base directories. Missing/unreadable paths yield nothing, except EPERM/EACCES,
 * reported in `denied` as the absolute path of the directory that could not be read (for a
 * literal segment whose lstat is denied, that is the parent directory). Output is sorted per directory.
 */
export async function expandPattern(
  root: string,
  pattern: string,
  exclude?: string[],
): Promise<{ paths: string[]; denied: string[] }> {
  const { segs } = parse(pattern);
  const denied = new Set<string>();
  let current: string[] = [pattern.startsWith("/") ? "/" : root];

  const keepDir = async (child: string, parent: string): Promise<boolean> => {
    try {
      const st = await fsp.lstat(child);
      return !st.isSymbolicLink();
    } catch (e) {
      if (isDenied(e)) denied.add(parent);
      return false;
    }
  };

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i] as string;
    const last = i === segs.length - 1;
    const next: string[] = [];
    for (const dir of current) {
      if (!isWildcard(seg) && seg !== "<uuid>") {
        const child = path.join(dir, seg);
        if (await keepDir(child, dir)) next.push(child);
        continue;
      }
      let names: string[];
      try {
        names = (await fsp.readdir(dir)).map(String).sort();
      } catch (e) {
        if (isDenied(e)) denied.add(dir);
        continue;
      }
      for (const name of names) {
        if (!segmentMatches(seg, name)) continue;
        if (exclude?.some((ex) => segmentMatches(ex, name))) continue;
        const child = path.join(dir, name);
        if (await keepDir(child, dir)) next.push(child);
      }
    }
    current = next;
    if (last) break;
  }
  return { paths: current, denied: [...denied].sort() };
}
