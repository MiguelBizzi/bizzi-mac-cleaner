import { t } from "../core/i18n.js";
import { fsp } from "../core/fs.js";
import type { CleanupItem } from "../scanners/types.js";
import { targetById } from "./catalog.js";
import { firstWildcardValue, matchPattern, relSegments } from "./match.js";
import { isAppRunning, type RunningApps } from "./probes.js";

/** Expected kind of an item from the pattern that matched it. Wildcard-last patterns also yield loose files. */
function expectedKind(pattern: string): "dir" | "file" | "either" {
  const last = pattern.split("/").filter(Boolean).pop() ?? "";
  if (/\.ipsw$/i.test(last)) return "file";
  return last.includes("*") || last === "<uuid>" ? "either" : "dir";
}

/**
 * Delete-time safety net for a scan-time snapshot. Returns a translated refusal, or null
 * when the item is still safe to trash. Order: advisory, unknown target, gone, kind
 * changed (incl. symlink), owning app running now (unknown running state counts as running).
 */
export async function systemDataPreflight(
  item: CleanupItem,
  root: string,
  apps: () => Promise<RunningApps>,
): Promise<string | null> {
  if (item.advisory) return t("sd.preflight.advisory");
  const target = item.targetId === undefined ? undefined : targetById(item.targetId);
  if (!target) return t("sd.preflight.unknown");
  const rel = relSegments(root, item.path);
  if (!rel) return t("sd.preflight.unknown");
  const pattern = target.patterns.find((p) => !p.startsWith("/") && matchPattern(p, rel));
  if (!pattern) return t("sd.preflight.unknown");

  let st: Awaited<ReturnType<typeof fsp.lstat>>;
  try {
    st = await fsp.lstat(item.path); // lstat: never follow a symlink swapped in since the scan
  } catch {
    return t("sd.preflight.gone");
  }
  const kind = expectedKind(pattern);
  const kindOk = kind === "either" || st.isDirectory() === (kind === "dir");
  if (st.isSymbolicLink() || !kindOk) return t("sd.preflight.changed");

  if (target.runningCheck !== undefined) {
    const value = firstWildcardValue(pattern, rel);
    if (isAppRunning(await apps(), target.runningCheck, value)) {
      const app =
        value ?? (typeof target.runningCheck === "object" ? target.runningCheck.names[0] : undefined) ?? "";
      return t("sd.preflight.running", { app });
    }
  }
  return null;
}
