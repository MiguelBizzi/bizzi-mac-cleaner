import type { CleanupItem, ScannerId } from "../scanners/types.js";
import { groupByCategory, type CategoryGroup } from "./selection.js";

export type ScanRow =
  | { type: "category"; group: CategoryGroup }
  | { type: "item"; item: CleanupItem; category: ScannerId };

export function buildScanRows(items: CleanupItem[], expanded: Set<string>): ScanRow[] {
  const rows: ScanRow[] = [];
  for (const group of groupByCategory(items)) {
    rows.push({ type: "category", group });
    if (!expanded.has(group.id)) continue;
    for (const item of group.items) {
      rows.push({ type: "item", item, category: group.id });
    }
  }
  return rows;
}

export function moveCursor(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index + delta));
}

/**
 * Keep `cursor` inside a sliding window of `size` rows.
 * Scrolls only when the cursor walks off the current window.
 */
export function followScroll(scroll: number, cursor: number, length: number, size: number): number {
  if (size <= 0 || length <= size) return 0;
  const max = length - size;
  const c = Math.max(0, Math.min(cursor, Math.max(0, length - 1)));
  if (c < scroll) return c;
  if (c >= scroll + size) return Math.min(max, c - size + 1);
  return Math.max(0, Math.min(scroll, max));
}
