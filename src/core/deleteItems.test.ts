import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CleanupItem } from "../scanners/types.js";

vi.mock("./deleteSafely.js", () => ({
  deleteSafely: vi.fn().mockResolvedValue({ ok: true, dryRun: true }),
  emptyTrash: vi.fn().mockResolvedValue({ ok: true, dryRun: true }),
}));

import { deleteItems } from "./deleteItems.js";
import { deleteSafely, emptyTrash } from "./deleteSafely.js";

function item(category: CleanupItem["category"], path: string): CleanupItem {
  return {
    id: `${category}:${path}`,
    category,
    path,
    sizeBytes: 1,
    lastModified: new Date(0),
    risk: "safe",
  };
}

describe("deleteItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes trash_bin through emptyTrash and everything else through deleteSafely", async () => {
    const seen: string[] = [];
    const result = await deleteItems(
      [item("npm_cache", "/fixture/a"), item("trash_bin", "/fixture/.Trash")],
      "/fixture",
      (i) => seen.push(i.category),
    );
    expect(deleteSafely).toHaveBeenCalledTimes(1);
    expect(emptyTrash).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["npm_cache", "trash_bin"]);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  it("continues after a failed item and reports both sides", async () => {
    vi.mocked(deleteSafely)
      .mockResolvedValueOnce({ ok: false, dryRun: false, error: "permission denied" })
      .mockResolvedValueOnce({ ok: true, dryRun: false });
    const result = await deleteItems(
      [item("npm_cache", "/fixture/a"), item("brew_cache", "/fixture/b")],
      "/fixture",
    );
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.error).toContain("permission");
  });
});
