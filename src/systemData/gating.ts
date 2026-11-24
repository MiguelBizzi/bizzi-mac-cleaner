import path from "node:path";
import { categoryViolation } from "../core/deletePolicy.js";
import { dirSize } from "../core/dirSize.js";
import { fsp } from "../core/fs.js";
import { t } from "../core/i18n.js";
import { itemId } from "../core/paths.js";
import type { CleanupItem } from "../scanners/types.js";
import type { SystemDataContext } from "./context.js";
import { compareVersions, parseProductVersion } from "./macos.js";
import type { SystemDataTarget } from "./types.js";

export const isDenied = (e: unknown): boolean => {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "EPERM" || code === "EACCES";
};

export function needsFda(target: SystemDataTarget, ctx: SystemDataContext): boolean {
  const fda = target.fda;
  if (fda === undefined) return false;
  if (fda === "required") return true;
  const from = parseProductVersion(fda.fromMacOS);
  // Unknown macOS or unparseable bound: assume the gate applies.
  return !from || !ctx.macos || compareVersions(ctx.macos, from) >= 0;
}

/** Placeholder for a skipped target: the nearest policy-refused ancestor of its first pattern's base. */
export function advisoryItem(target: SystemDataTarget, root: string): CleanupItem {
  const base = (target.patterns[0] ?? "").split("/").filter(Boolean);
  const i = base.findIndex((s) => s.includes("*") || s === "<uuid>");
  const fixed = i === -1 ? base : base.slice(0, i);
  // The path must never be one the delete policy would allow: this item was not measured.
  // Walk up to the nearest ancestor the policy refuses (never the scan root itself).
  let p = path.join(root, ...fixed);
  while (p !== path.resolve(root) && categoryViolation("system_data", p, root) === null) p = path.dirname(p);
  if (p === path.resolve(root)) p = path.join(root, "Library");
  return {
    id: itemId("system_data", `fda:${target.id}`),
    category: "system_data",
    path: p,
    sizeBytes: 0,
    lastModified: new Date(0),
    description: t(`sd.${target.id}.label`),
    risk: "caution",
    targetId: target.id,
    advisory: true,
    sizeUnknown: true,
    note: t("sd.needsFda"),
  };
}

/** Sizes a matched item; "denied" when macOS (TCC) refuses to let us read it. */
export async function measure(full: string, signal?: AbortSignal): Promise<{ bytes: number; mtime: Date } | "denied" | null> {
  let st;
  try {
    st = await fsp.lstat(full);
  } catch (e) {
    return isDenied(e) ? "denied" : null;
  }
  if (!st.isDirectory()) return { bytes: st.size, mtime: st.mtime };
  try {
    await fsp.readdir(full);
  } catch (e) {
    return isDenied(e) ? "denied" : null;
  }
  return { bytes: await dirSize(full, signal), mtime: st.mtime };
}
