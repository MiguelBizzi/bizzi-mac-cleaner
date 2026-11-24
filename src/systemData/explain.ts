import { formatBytes } from "../core/format.js";
import { hasKey, t } from "../core/i18n.js";
import { isSelectable } from "../core/selection.js";
import type { CleanupItem } from "../scanners/types.js";
import { targetById } from "./catalog.js";
import type { SystemDataContext } from "./context.js";

export interface Explanation {
  title: string;
  group: string;
  safety: string;
  safetyDef: string;
  why: string;
  regen?: string;
  impact?: string;
  commands?: string[];
  path: string;
}

/** Translation when the key exists, otherwise undefined (t() echoes the key when missing). */
function maybe(key: string): string | undefined {
  return hasKey(key) ? t(key) : undefined;
}

export function explainItem(item: CleanupItem): Explanation | null {
  if (!item.targetId) return null;
  const target = targetById(item.targetId);
  if (!target) return null;
  const level = item.advisory ? "advisory" : target.safety;
  const regen = maybe(`sd.${target.id}.regen`);
  const impact = maybe(`sd.${target.id}.impact`);
  return {
    title: t(`sd.${target.id}.label`),
    group: t(`sd.group.${target.group}`),
    safety: t(`sd.safety.${level}`),
    safetyDef: t(`sd.safety.${level}.def`),
    why: t(`sd.${target.id}.why`),
    ...(regen ? { regen } : {}),
    ...(impact ? { impact } : {}),
    ...(target.commands?.length ? { commands: [...target.commands] } : {}),
    path: item.path,
  };
}

export interface SystemDataSummary {
  reclaimableBytes: number;
  reviewBytes: number;
  advisoryBytes: number;
  advisoryCount: number;
  needsFdaCount: number;
}

/** Advisory bytes live in their own figure; they never mix into reclaimable/review. */
export function summarizeSystemData(items: CleanupItem[]): SystemDataSummary {
  const s: SystemDataSummary = { reclaimableBytes: 0, reviewBytes: 0, advisoryBytes: 0, advisoryCount: 0, needsFdaCount: 0 };
  const fdaNote = t("sd.needsFda");
  for (const i of items) {
    if (!isSelectable(i)) {
      s.advisoryCount += 1;
      s.advisoryBytes += i.sizeBytes;
      if (i.sizeUnknown && i.note === fdaNote) s.needsFdaCount += 1;
    } else if (i.risk === "safe") s.reclaimableBytes += i.sizeBytes;
    else s.reviewBytes += i.sizeBytes;
  }
  return s;
}

/** Distinct `sd.<id>.impact` texts of the caution items, first-seen order. */
export function confirmImpacts(items: CleanupItem[]): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (i.risk !== "caution" || !i.targetId) continue;
    const impact = maybe(`sd.${i.targetId}.impact`);
    if (impact && !out.includes(impact)) out.push(impact);
  }
  return out;
}

/** The three header lines; `ctx` null = still loading. Never throws on a conservative context. */
export function headerLines(ctx: SystemDataContext | null, sum: SystemDataSummary): string[] {
  const summary = t("sd.header.summary", {
    safe: formatBytes(sum.reclaimableBytes),
    review: formatBytes(sum.reviewBytes),
    advisory: formatBytes(sum.advisoryBytes),
  });
  if (!ctx) return [t("sd.header.loading"), summary];
  const version = ctx.macos
    ? `${ctx.macos.major}.${ctx.macos.minor}${ctx.macos.patch ? `.${ctx.macos.patch}` : ""}`
    : t("sd.header.unknownVersion");
  const state = t(`sd.header.${ctx.support}`);
  const fda =
    ctx.fda === "granted"
      ? t("sd.header.fdaGranted")
      : ctx.fda === "denied"
        ? t("sd.header.fdaDenied", { count: sum.needsFdaCount })
        : t("sd.header.fdaUnknown");
  return [t("sd.header.macos", { version, state }), t("sd.header.fda", { state: fda }), summary];
}

export interface ItemRowView {
  dim: boolean;
  mark: string;
  size: string;
  tag: string;
}

export function itemRowView(item: CleanupItem, selected: boolean): ItemRowView {
  const size = item.sizeUnknown ? "—" : formatBytes(item.sizeBytes);
  if (item.advisory) return { dim: true, mark: "[i]", size, tag: t("sd.safety.advisory") };
  return { dim: false, mark: selected ? "[x]" : "[ ]", size, tag: t(`scan.${item.risk}`) };
}
