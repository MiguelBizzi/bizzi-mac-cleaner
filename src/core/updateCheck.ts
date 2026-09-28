import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "bizzi-mac-cleaner";
const REGISTRY_LATEST = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const DEFAULT_TIMEOUT_MS = 2500;

export interface UpdateNotice {
  current: string;
  latest: string;
}

interface ParsedVersion {
  parts: number[];
  prerelease: boolean;
}

function parseVersion(version: string): ParsedVersion {
  const raw = version.trim().replace(/^v/, "");
  const [core, pre] = raw.split("-", 2);
  const parts = (core ?? "")
    .split(".")
    .filter((part) => part.length > 0)
    .map((part) => {
      const value = Number.parseInt(part, 10);
      return Number.isFinite(value) ? value : 0;
    });
  return { parts, prerelease: pre !== undefined && pre.length > 0 };
}

/** True when `latest` is a newer release than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const next = parseVersion(latest);
  const installed = parseVersion(current);
  if (next.parts.length === 0) return false;
  const length = Math.max(next.parts.length, installed.parts.length);
  for (let i = 0; i < length; i++) {
    const nextPart = next.parts[i] ?? 0;
    const installedPart = installed.parts[i] ?? 0;
    if (nextPart !== installedPart) return nextPart > installedPart;
  }
  return !next.prerelease && installed.prerelease;
}

export function currentPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: unknown };
  return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
}

function requestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchLatestVersion(timeoutMs: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(REGISTRY_LATEST, {
      signal: requestSignal(timeoutMs, signal),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" && body.version.length > 0 ? body.version : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate(options?: {
  current?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchLatest?: () => Promise<string | null>;
}): Promise<UpdateNotice | null> {
  const current = options?.current ?? currentPackageVersion();
  let latest: string | null;
  try {
    latest = options?.fetchLatest
      ? await options.fetchLatest()
      : await fetchLatestVersion(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal);
  } catch {
    return null;
  }
  if (!latest || !isNewerVersion(latest, current)) return null;
  return { current, latest };
}
