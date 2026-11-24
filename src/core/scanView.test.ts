import { describe, expect, it } from "vitest";
import { buildScanRows, fitRows, followScroll, moveCursor, rowHeight, type ScanRow } from "./scanView.js";
import type { CleanupItem } from "../scanners/types.js";

const items: CleanupItem[] = [
  {
    id: "npm:a",
    category: "npm_cache",
    path: "/a",
    sizeBytes: 10,
    lastModified: new Date(0),
    risk: "safe",
  },
  {
    id: "npm:b",
    category: "npm_cache",
    path: "/b",
    sizeBytes: 20,
    lastModified: new Date(0),
    risk: "safe",
  },
];

describe("scanView", () => {
  it("hides items until the category is expanded", () => {
    const collapsed = buildScanRows(items, new Set());
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.type).toBe("category");
    const open = buildScanRows(items, new Set(["npm_cache"]));
    expect(open).toHaveLength(3);
  });

  it("clamps the cursor instead of wrapping", () => {
    expect(moveCursor(0, -1, 3)).toBe(0);
    expect(moveCursor(2, 1, 3)).toBe(2);
    expect(moveCursor(1, 1, 3)).toBe(2);
  });

  it("scrolls the viewport only when the cursor leaves it", () => {
    expect(followScroll(0, 3, 20, 8)).toBe(0);
    expect(followScroll(0, 8, 20, 8)).toBe(1);
    expect(followScroll(5, 4, 20, 8)).toBe(4);
    expect(followScroll(0, 0, 5, 10)).toBe(0);
  });
});

describe("fitRows", () => {
  const mk = (n: number, noteEvery = 0): ScanRow[] =>
    Array.from({ length: n }, (_, i) => ({
      type: "item" as const,
      category: "system_data" as const,
      item: {
        id: `i${i}`,
        category: "system_data" as const,
        path: `/p${i}`,
        sizeBytes: 1,
        lastModified: new Date(0),
        risk: "safe" as const,
        ...(noteEvery && i % noteEvery === 0 ? { note: "n" } : {}),
      },
    }));
  const height = (rows: ScanRow[], r: { start: number; end: number }) =>
    rows.slice(r.start, r.end).reduce((s, x) => s + rowHeight(x), 0);

  it("counts a note as an extra line", () => {
    expect(rowHeight(mk(1)[0]!)).toBe(1);
    expect(rowHeight(mk(1, 1)[0]!)).toBe(2);
  });
  it("never exceeds the budget even when every item has a note, and keeps the cursor visible", () => {
    const rows = mk(30, 1);
    for (let cursor = 0; cursor < 30; cursor++) {
      const r = fitRows(rows, 0, cursor, 10);
      expect(height(rows, r)).toBeLessThanOrEqual(10);
      expect(r.start).toBeLessThanOrEqual(cursor);
      expect(r.end).toBeGreaterThan(cursor);
    }
  });
  it("degrades to a minimum budget of 3 lines on tiny terminals", () => {
    const rows = mk(10);
    for (const budget of [0, -5, 1]) {
      const r = fitRows(rows, 0, 0, budget);
      expect(r.end - r.start).toBe(3);
    }
    const r = fitRows(mk(10, 1), 0, 4, -2);
    expect(r.start).toBeLessThanOrEqual(4);
    expect(r.end).toBeGreaterThan(4);
  });
  it("shows everything when it fits", () => {
    expect(fitRows(mk(4), 0, 0, 10)).toEqual({ start: 0, end: 4 });
  });
});
