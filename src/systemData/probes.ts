import path from "node:path";
import { fsp } from "../core/fs.js";
import { execCommand } from "../core/shell/exec.js";
import type { SystemDataTarget } from "./types.js";

/**
 * Read-only environment probes. Every function returns its "unknown" value on
 * any error and never throws. Executables are absolute paths (no $PATH lookup)
 * and run through execFile (no shell); untrusted values are argv elements.
 */

export interface RunningApps {
  names: Set<string>;
  bundleIds: Set<string>;
  /** false when ps or lsappinfo failed/timed out: empty sets then mean "unknown", not "nothing running". */
  ok: boolean;
}

export async function probeFullDiskAccess(home: string): Promise<"granted" | "denied" | "unknown"> {
  try {
    await fsp.readdir(path.join(home, "Library", "Safari"));
    return "granted";
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    return code === "EPERM" || code === "EACCES" ? "denied" : "unknown";
  }
}

export async function runningApps(): Promise<RunningApps> {
  const names = new Set<string>();
  const bundleIds = new Set<string>();
  let ok = true;
  try {
    const { stdout } = await execCommand("/bin/ps", ["-axo", "comm="], { timeout: 5_000 });
    for (const raw of stdout.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const base = path.posix.basename(line).toLowerCase();
      if (base) names.add(base);
      for (const m of line.matchAll(/\/([^/]+)\.app(?=\/|$)/g)) names.add(m[1]!.toLowerCase());
    }
  } catch {
    ok = false;
  }
  try {
    const { stdout } = await execCommand("/usr/bin/lsappinfo", ["list"], { timeout: 5_000 });
    for (const m of stdout.matchAll(/bundleID="([^"]+)"/g)) bundleIds.add(m[1]!.toLowerCase());
  } catch {
    ok = false;
  }
  return { names, bundleIds, ok };
}

export function isAppRunning(
  apps: RunningApps,
  check: SystemDataTarget["runningCheck"],
  wildcardValue?: string,
): boolean {
  if (check === undefined) return false;
  // Fail closed: a required check that cannot be evaluated counts as "running".
  if (!apps.ok) return true;
  if (check === "bundleIdFolder") {
    return wildcardValue === undefined || apps.bundleIds.has(wildcardValue.toLowerCase());
  }
  if (check === "folderName") {
    if (wildcardValue === undefined) return true;
    const n = wildcardValue.toLowerCase();
    for (const name of apps.names) if (name === n || name.startsWith(`${n} `)) return true;
    return false;
  }
  return check.names.some((n) => apps.names.has(n.toLowerCase()));
}

export async function plistValue(file: string, key: string): Promise<string | null> {
  try {
    const { stdout } = await execCommand("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", file], {
      timeout: 5_000,
    });
    const v = stdout.trim();
    return v === "" ? null : v;
  } catch {
    return null;
  }
}

export async function localSnapshots(): Promise<Date[] | null> {
  try {
    const { stdout } = await execCommand("/usr/bin/tmutil", ["listlocalsnapshots", "/"], { timeout: 15_000 });
    const out: Date[] = [];
    for (const m of stdout.matchAll(/com\.apple\.TimeMachine\.(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.local/g)) {
      // Snapshot names carry local time.
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
      if (!Number.isNaN(d.getTime())) out.push(d);
    }
    return out;
  } catch {
    return null;
  }
}

export interface SimulatorRuntime {
  identifier: string;
  version: string;
  sizeBytes: number | null;
  lastUsedAt: Date | null;
  deletable: boolean;
}

export async function simulatorRuntimes(): Promise<SimulatorRuntime[] | null> {
  try {
    const { stdout } = await execCommand("/usr/bin/xcrun", ["simctl", "runtime", "list", "-j"], {
      timeout: 15_000,
    });
    const parsed: unknown = JSON.parse(stdout);
    if (parsed === null || typeof parsed !== "object") return null;
    const out: SimulatorRuntime[] = [];
    for (const entry of Object.values(parsed as object)) {
      if (entry === null || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.identifier !== "string" || e.identifier === "") continue;
      let lastUsedAt: Date | null = null;
      if (typeof e.lastUsedAt === "string") {
        const d = new Date(e.lastUsedAt);
        if (!Number.isNaN(d.getTime())) lastUsedAt = d;
      }
      out.push({
        identifier: e.identifier,
        version: typeof e.version === "string" ? e.version : "",
        sizeBytes: typeof e.sizeBytes === "number" && Number.isFinite(e.sizeBytes) ? e.sizeBytes : null,
        lastUsedAt,
        deletable: e.deletable === true,
      });
    }
    return out;
  } catch {
    return null;
  }
}

export async function darwinUserDirs(): Promise<string[]> {
  const out: string[] = [];
  for (const name of ["DARWIN_USER_CACHE_DIR", "DARWIN_USER_TEMP_DIR"]) {
    try {
      const { stdout } = await execCommand("/usr/bin/getconf", [name], { timeout: 5_000 });
      const p = stdout.trim();
      const underFolders = p.startsWith("/private/var/folders/") || p.startsWith("/var/folders/");
      if (underFolders && !p.split("/").includes("..")) out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function allocatedBytes(st: { size: number; blocks?: number }): number {
  return typeof st.blocks === "number" ? st.blocks * 512 : st.size;
}
