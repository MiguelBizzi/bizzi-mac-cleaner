import type { CleanupItem, ScannerId } from "../scanners/types.js";

/** Advisory rows inform only; they can never be selected or deleted. */
export function isSelectable(item: CleanupItem): boolean {
  return !item.advisory;
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
  const inCat = items.filter((i) => i.category === category && isSelectable(i));
  const allOn = inCat.length > 0 && inCat.every((i) => next.has(i.id));
  for (const item of inCat) {
    if (allOn) next.delete(item.id);
    else next.add(item.id);
  }
  return next;
}

/** Toggle every item: if all are selected, clear; otherwise select all. */
export function toggleAll(items: CleanupItem[], selected: Set<string>): Set<string> {
  const pickable = items.filter(isSelectable);
  const allOn = pickable.length > 0 && pickable.every((i) => selected.has(i.id));
  if (allOn) return new Set();
  return new Set(pickable.map((i) => i.id));
}

export type CheckState = "all" | "none" | "some";

export function checkGlyph(state: CheckState): string {
  if (state === "all") return "[x]";
  if (state === "some") return "[~]";
  return "[ ]";
}

export function categoryCheckState(
  items: CleanupItem[],
  selected: Set<string>,
  category: ScannerId,
): CheckState {
  const inCat = items.filter((i) => i.category === category && isSelectable(i));
  if (inCat.length === 0) return "none";
  const n = inCat.filter((i) => selected.has(i.id)).length;
  if (n === 0) return "none";
  if (n === inCat.length) return "all";
  return "some";
}

export function listCheckState(items: CleanupItem[], selected: Set<string>): CheckState {
  const pickable = items.filter(isSelectable);
  if (pickable.length === 0) return "none";
  const n = pickable.filter((i) => selected.has(i.id)).length;
  if (n === 0) return "none";
  if (n === pickable.length) return "all";
  return "some";
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
