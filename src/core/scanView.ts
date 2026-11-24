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

export const MIN_LIST_LINES = 3;

/** Terminal lines a row takes: items with a note print it on a second line. */
export function rowHeight(row: ScanRow): number {
  return row.type === "item" && row.item.note ? 2 : 1;
}

/**
 * Window [start, end) of rows that fits `budget` lines (min 3), always containing
 * `cursor`. `scroll` is the preferred start.
 */
export function fitRows(
  rows: ScanRow[],
  scroll: number,
  cursor: number,
  budget: number,
): { start: number; end: number } {
  if (rows.length === 0) return { start: 0, end: 0 };
  const limit = Math.max(MIN_LIST_LINES, budget);
  const c = Math.max(0, Math.min(cursor, rows.length - 1));
  let start = Math.max(0, Math.min(scroll, c));
  const span = (a: number, b: number) => {
    let h = 0;
    for (let i = a; i < b; i++) h += rowHeight(rows[i]!);
    return h;
  };
  while (start < c && span(start, c + 1) > limit) start++;
  let end = c + 1;
  let used = span(start, end);
  while (end < rows.length && used + rowHeight(rows[end]!) <= limit) {
    used += rowHeight(rows[end]!);
    end++;
  }
  return { start, end };
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
