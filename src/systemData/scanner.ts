import path from "node:path";
import { categoryViolation } from "../core/deletePolicy.js";
import { fsp } from "../core/fs.js";
import { t } from "../core/i18n.js";
import { itemId } from "../core/paths.js";
import type { CleanupItem, Risk, ScanOptions, Scanner } from "../scanners/types.js";
import { TARGETS, findNeverTarget } from "./catalog.js";
import { getSystemDataContext, type SystemDataContext } from "./context.js";
import { inRange } from "./macos.js";
import { expandPattern, firstWildcardValue, relSegments } from "./match.js";
import { scanAdvisories } from "./advisories.js";
import { advisoryItem, measure, needsFda } from "./gating.js";
import { isAppRunning, plistValue } from "./probes.js";
import type { SystemDataTarget } from "./types.js";

const isoDay = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

async function describe(
  target: SystemDataTarget,
  pattern: string,
  rel: string[],
  full: string,
  ctx: SystemDataContext,
): Promise<string> {
  const value = firstWildcardValue(pattern, rel);
  if (target.id === "backups.ios" && value !== undefined && ctx.shell) {
    const info = path.join(full, "Info.plist");
    const [name, date] = await Promise.all([plistValue(info, "Device Name"), plistValue(info, "Last Backup Date")]);
    const day = isoDay(date);
    if (name && day) return `${name} · ${day}`;
  }
  const label = t(`sd.${target.id}.label`);
  return value === undefined ? label : `${label} · ${value}`;
}

/** Wildcard directory that must carry one of `markerAnyOf` (e.g. a Chromium userData dir). */
async function hasMarker(target: SystemDataTarget, pattern: string, rel: string[], root: string): Promise<boolean> {
  if (!target.markerAnyOf) return true;
  const i = pattern.split("/").filter(Boolean).findIndex((s) => s.includes("*"));
  if (i === -1) return false;
  const dir = path.join(root, ...rel.slice(0, i + 1));
  for (const marker of target.markerAnyOf) {
    try {
      await fsp.lstat(path.join(dir, marker));
      return true;
    } catch {
      /* try the next marker */
    }
  }
  return false;
}

export async function* scanDeletableTargets(
  options: ScanOptions,
  ctx: SystemDataContext,
): AsyncGenerator<CleanupItem> {
  if (ctx.support === "unsupported") return;
  const { root, signal } = options;
  const seen = new Set<string>();
  for (const target of TARGETS) {
    if (signal?.aborted) return;
    if ((target.safety !== "safe" && target.safety !== "review") || target.ownedBy) continue;
    if (!inRange(ctx.macos, target.macos)) continue;
    if (needsFda(target, ctx) && ctx.fda !== "granted") {
      yield advisoryItem(target, root);
      continue;
    }
    let gated = false;
    const found: Array<{ pattern: string; full: string }> = [];
    for (const pattern of target.patterns) {
      const { paths, denied } = await expandPattern(root, pattern, target.exclude);
      if (denied.length > 0) gated = true;
      for (const full of paths) found.push({ pattern, full });
    }
    for (const { pattern, full } of found) {
      if (signal?.aborted) return;
      if (seen.has(full)) continue;
      seen.add(full);
      const rel = relSegments(root, full);
      if (!rel || findNeverTarget(rel, full)) continue;
      if (!(await hasMarker(target, pattern, rel, root))) continue;
      if (categoryViolation("system_data", full, root)) continue;
      const size = await measure(full, signal);
      if (size === "denied") {
        gated = true;
        continue;
      }
      if (!size || size.bytes <= 0) continue;
      const value = firstWildcardValue(pattern, rel);
      const running = isAppRunning(ctx.apps, target.runningCheck, value);
      const app = value ?? (typeof target.runningCheck === "object" ? target.runningCheck.names[0] : undefined) ?? "";
      const risk: Risk = target.safety === "safe" && ctx.support !== "unverified" && !running ? "safe" : "caution";
      yield {
        id: itemId("system_data", full),
        category: "system_data",
        path: full,
        sizeBytes: size.bytes,
        lastModified: size.mtime,
        description: await describe(target, pattern, rel, full, ctx),
        risk,
        targetId: target.id,
        ...(running ? { note: t("sd.appRunning", { app }) } : {}),
      };
    }
    if (gated) yield advisoryItem(target, root);
  }
}

export const systemDataScanner: Scanner = {
  id: "system_data",
  labelKey: "scanners.systemData",
  async *scan(options) {
    const ctx = await getSystemDataContext(options.root);
    yield* scanDeletableTargets(options, ctx);
    // Advisories are information only, so they also run below MIN_SUPPORTED_MACOS.
    yield* scanAdvisories(options, ctx);
  },
};
