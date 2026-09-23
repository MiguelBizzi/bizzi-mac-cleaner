import { describe, expect, it } from "vitest";
import type { CleanupItem } from "../scanners/types.js";
import {
  categoryCheckState,
  checkGlyph,
  dockerOrArchives,
  groupByCategory,
  listCheckState,
  needsExtraConfirm,
  selectAllInCategory,
  selectedTotal,
  toggleAll,
  toggleId,
} from "./selection.js";

function item(partial: Partial<CleanupItem> & Pick<CleanupItem, "id" | "category">): CleanupItem {
  return {
    path: `/${partial.id}`,
    sizeBytes: 10,
    lastModified: new Date(0),
    risk: "safe",
    ...partial,
  };
}

describe("selection", () => {
  it("toggles ids on and off", () => {
    let set = new Set<string>();
    set = toggleId(set, "a");
    expect(set.has("a")).toBe(true);
    set = toggleId(set, "a");
    expect(set.has("a")).toBe(false);
  });

  it("selects and deselects all items in a category", () => {
    const items = [
      item({ id: "1", category: "npm_cache", sizeBytes: 5 }),
      item({ id: "2", category: "npm_cache", sizeBytes: 7 }),
      item({ id: "3", category: "brew_cache", sizeBytes: 9 }),
    ];
    let selected = selectAllInCategory(new Set(), items, "npm_cache");
    expect([...selected]).toEqual(["1", "2"]);
    expect(selectedTotal(items, selected)).toEqual({ count: 2, bytes: 12 });
    selected = selectAllInCategory(selected, items, "npm_cache");
    expect(selected.size).toBe(0);
  });

  it("toggles every item with toggleAll", () => {
    const items = [
      item({ id: "1", category: "npm_cache", sizeBytes: 5 }),
      item({ id: "2", category: "brew_cache", sizeBytes: 7 }),
    ];
    const all = toggleAll(items, new Set());
    expect(all).toEqual(new Set(["1", "2"]));
    expect(toggleAll(items, all).size).toBe(0);
  });

  it("reports category and list checkbox state", () => {
    const items = [
      item({ id: "1", category: "npm_cache" }),
      item({ id: "2", category: "npm_cache" }),
      item({ id: "3", category: "brew_cache" }),
    ];
    expect(categoryCheckState(items, new Set(), "npm_cache")).toBe("none");
    expect(checkGlyph("none")).toBe("[ ]");
    expect(categoryCheckState(items, new Set(["1"]), "npm_cache")).toBe("some");
    expect(checkGlyph("some")).toBe("[~]");
    expect(categoryCheckState(items, new Set(["1", "2"]), "npm_cache")).toBe("all");
    expect(checkGlyph("all")).toBe("[x]");
    expect(listCheckState(items, new Set(["1", "2", "3"]))).toBe("all");
  });

  it("groups by category and sums bytes", () => {
    const groups = groupByCategory([
      item({ id: "1", category: "npm_cache", sizeBytes: 5 }),
      item({ id: "2", category: "brew_cache", sizeBytes: 3 }),
      item({ id: "3", category: "npm_cache", sizeBytes: 1 }),
    ]);
    expect(groups.find((g) => g.id === "npm_cache")?.bytes).toBe(6);
  });

  it("flags docker, archives, and other caution items for extra confirmation", () => {
    expect(dockerOrArchives([item({ id: "1", category: "docker_unused" })])).toBe(true);
    expect(dockerOrArchives([item({ id: "1", category: "xcode_archives" })])).toBe(true);
    expect(dockerOrArchives([item({ id: "1", category: "npm_cache" })])).toBe(false);
    expect(needsExtraConfirm([item({ id: "1", category: "npm_cache", risk: "caution" })])).toBe(true);
    expect(needsExtraConfirm([item({ id: "1", category: "npm_cache", risk: "safe" })])).toBe(false);
  });
});
