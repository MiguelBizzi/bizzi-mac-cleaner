import { execFileSync } from "node:child_process";
import os from "node:os";

export interface MacOSVersion {
  major: number;
  minor: number;
  patch: number;
}

export const MIN_SUPPORTED_MACOS = 12;
export const VERIFIED_THROUGH_MACOS = 27;

export function parseProductVersion(s: string): MacOSVersion | null {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(s.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), patch: Number(m[3] ?? 0) };
}

/** Darwin 21-24 map to macOS 12-15; from Darwin 25 on, macOS = Darwin + 1 (Tahoe = 26). */
export function darwinToMacOS(release: string): MacOSVersion | null {
  const d = Number.parseInt(release, 10);
  if (!Number.isFinite(d)) return null;
  if (d >= 21 && d <= 24) return { major: d - 9, minor: 0, patch: 0 };
  if (d >= 25) return { major: d + 1, minor: 0, patch: 0 };
  return null;
}

let cached: MacOSVersion | null | undefined;
let override: MacOSVersion | null | undefined;

export function currentMacOS(): MacOSVersion | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  let result: MacOSVersion | null;
  try {
    const out = execFileSync("/usr/bin/sw_vers", ["-productVersion"], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    result = parseProductVersion(String(out));
  } catch {
    result = darwinToMacOS(os.release());
  }
  cached = result;
  return result;
}

export function setMacOSForTests(v: MacOSVersion | null | undefined): void {
  override = v;
  cached = undefined;
}

export function compareVersions(a: MacOSVersion, b: MacOSVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** Bounds are inclusive; `max: "15"` means 15.0.0 only (excludes 15.4). Unparseable bounds fail closed (false). */
export function inRange(
  v: MacOSVersion | null,
  range?: { min?: string; max?: string },
): boolean {
  if (!range) return true;
  if (v === null) return false;
  if (range.min !== undefined) {
    const min = parseProductVersion(range.min);
    if (!min || compareVersions(v, min) < 0) return false;
  }
  if (range.max !== undefined) {
    const max = parseProductVersion(range.max);
    if (!max || compareVersions(v, max) > 0) return false;
  }
  return true;
}

export function supportLevel(v: MacOSVersion | null): "unsupported" | "verified" | "unverified" {
  if (v === null) return "unverified";
  if (v.major < MIN_SUPPORTED_MACOS) return "unsupported";
  if (v.major > VERIFIED_THROUGH_MACOS) return "unverified";
  return "verified";
}
