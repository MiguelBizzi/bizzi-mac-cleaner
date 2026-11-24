import type { CleanupItem, ScannerId } from "../scanners/types.js";

/** Advisory rows inform only; they can never be selected or deleted. */
export function isSelectable(item: CleanupItem): boolean {
  return !item.advisory;
}

/**
 * What bulk select (`a`, category space) may pick: selectable items, except
 * review-level System Data, which can hold irreplaceable data (backups, AVDs,
 * simulator devices) and must be toggled one by one.
 */
export function isBulkSelectable(item: CleanupItem): boolean {
  return isSelectable(item) && !(item.category === "system_data" && item.risk !== "safe");
}

export function toggleId(selected: Set<string>, id: string, items: CleanupItem[]): Set<string> {
  const target = items.find((i) => i.id === id);
  if (!target || !isSelectable(target)) return selected;
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAllInCategory(
  selected: Set<string>,
  items: CleanupItem[],
  category: ScannerId,
): Set<string> {
  const next = new Set(selected);
  const inCat = items.filter((i) => i.category === category && isBulkSelectable(i));
  const allOn = inCat.length > 0 && inCat.every((i) => next.has(i.id));
  for (const item of inCat) {
    if (allOn) next.delete(item.id);
    else next.add(item.id);
  }
  return next;
}

/** Toggle every item: if all are selected, clear; otherwise select all. */
export function toggleAll(items: CleanupItem[], selected: Set<string>): Set<string> {
  const pickable = items.filter(isBulkSelectable);
  const allOn = pickable.length > 0 && pickable.every((i) => selected.has(i.id));
  if (allOn) return new Set();
  const next = new Set(selected);
  for (const i of pickable) next.add(i.id);
  return next;
}

export type CheckState = "all" | "none" | "some";

export function checkGlyph(state: CheckState): string {
  if (state === "all") return "[x]";
  if (state === "some") return "[~]";
  return "[ ]";
}

/** "all" = every bulk-selectable item picked and nothing else; manual picks outside bulk make it "some". */
function tri(scope: CleanupItem[], selected: Set<string>): CheckState {
  const bulk = scope.filter(isBulkSelectable);
  const manual = scope.filter((i) => isSelectable(i) && !isBulkSelectable(i) && selected.has(i.id)).length;
  const n = bulk.filter((i) => selected.has(i.id)).length;
  if (n === 0 && manual === 0) return "none";
  if (manual === 0 && n === bulk.length) return "all";
  return "some";
}

export function categoryCheckState(
  items: CleanupItem[],
  selected: Set<string>,
  category: ScannerId,
): CheckState {
  return tri(items.filter((i) => i.category === category), selected);
}

export function listCheckState(items: CleanupItem[], selected: Set<string>): CheckState {
  return tri(items, selected);
}

export function selectedItems(items: CleanupItem[], selected: Set<string>): CleanupItem[] {
  return items.filter((i) => isSelectable(i) && selected.has(i.id));
}

export function selectedTotal(
  items: CleanupItem[],
  selected: Set<string>,
): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  for (const item of items) {
    if (!isSelectable(item) || !selected.has(item.id)) continue;
    count += 1;
    bytes += item.sizeBytes;
  }
  return { count, bytes };
}

/** Bytes the app can reclaim: advisory sizes are information only and never counted. */
export function foundBytes(items: CleanupItem[]): number {
  return items.reduce((sum, i) => (isSelectable(i) ? sum + i.sizeBytes : sum), 0);
}

export interface CategoryGroup {
  id: ScannerId;
  items: CleanupItem[];
  bytes: number;
}

export function groupByCategory(items: CleanupItem[]): CategoryGroup[] {
  const map = new Map<ScannerId, CleanupItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return [...map.entries()].map(([id, grouped]) => ({
    id,
    items: grouped,
    bytes: foundBytes(grouped),
  }));
}

export function needsExtraConfirm(items: CleanupItem[]): boolean {
  return items.some(
    (i) => i.category === "docker_unused" || i.category === "xcode_archives" || i.risk === "caution",
  );
}

export function dockerOrArchives(items: CleanupItem[]): boolean {
  return items.some((i) => i.category === "docker_unused" || i.category === "xcode_archives");
}
