import { describe, expect, it } from "vitest";
import type { CleanupItem } from "../scanners/types.js";
import {
  categoryCheckState,
  checkGlyph,
  dockerOrArchives,
  foundBytes,
  groupByCategory,
  listCheckState,
  needsExtraConfirm,
  isSelectable,
  selectAllInCategory,
  selectedItems,
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
    const items = [item({ id: "a", category: "npm_cache" })];
    set = toggleId(set, "a", items);
    expect(set.has("a")).toBe(true);
    set = toggleId(set, "a", items);
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

  describe("advisory items", () => {
    const items = [
      item({ id: "a", category: "system_data" }),
      item({ id: "b", category: "system_data", advisory: true, sizeBytes: 99 }),
    ];
    it("is not selectable", () => {
      expect(isSelectable(items[0]!)).toBe(true);
      expect(isSelectable(items[1]!)).toBe(false);
    });
    it("never selects advisory items", () => {
      expect([...toggleAll(items, new Set())]).toEqual(["a"]);
      expect(toggleId(new Set(), "b", items).size).toBe(0);
      expect([...selectAllInCategory(new Set(), items, "system_data")]).toEqual(["a"]);
    });
    it("selecting all in an advisory-only category selects nothing", () => {
      const only = [items[1]!];
      expect(selectAllInCategory(new Set(), only, "system_data").size).toBe(0);
      expect(toggleAll(only, new Set()).size).toBe(0);
      expect(categoryCheckState(only, new Set(), "system_data")).toBe("none");
      expect(listCheckState(only, new Set())).toBe("none");
    });
    it("ignores advisory ids that sneak into the selection", () => {
      const sel = new Set(["a", "b"]);
      expect(selectedItems(items, sel).map((i) => i.id)).toEqual(["a"]);
      expect(selectedTotal(items, sel)).toEqual({ count: 1, bytes: 10 });
      expect(categoryCheckState(items, sel, "system_data")).toBe("all");
      expect(toggleAll(items, sel)).toEqual(new Set());
      expect(toggleId(sel, "a", items)).toEqual(new Set(["b"]));
    });
    it("a lone selectable item toggles a mixed category to all", () => {
      expect(categoryCheckState(items, new Set(["a"]), "system_data")).toBe("all");
    });
  
    it("group and found bytes ignore advisories", () => {
      const mixed = [...items, item({ id: "c", category: "npm_cache", sizeBytes: 5 })];
      const groups = groupByCategory(mixed);
      expect(groups.find((g) => g.id === "system_data")!.bytes).toBe(10);
      expect(foundBytes(mixed)).toBe(15);
      const only = groupByCategory([items[1]!]);
      expect(only[0]!.bytes).toBe(0);
      expect(foundBytes([items[1]!])).toBe(0);
    });
  });
});
