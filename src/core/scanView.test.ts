import { describe, expect, it } from "vitest";
import { buildScanRows, followScroll, moveCursor } from "./scanView.js";
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
