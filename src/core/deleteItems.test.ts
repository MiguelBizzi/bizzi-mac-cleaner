import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";
import type { CleanupItem } from "../scanners/types.js";

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs, promises: fs.promises };
});
vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});
vi.mock("./deleteSafely.js", () => ({
  deleteSafely: vi.fn().mockResolvedValue({ ok: true, dryRun: true }),
  emptyTrash: vi.fn().mockResolvedValue({ ok: true, dryRun: true }),
}));

vi.mock("../systemData/probes.js", async (orig) => ({
  ...(await orig<typeof import("../systemData/probes.js")>()),
  runningApps: vi.fn().mockResolvedValue({ names: new Set(), bundleIds: new Set(), ok: true }),
}));

import { runningApps } from "../systemData/probes.js";
import { deleteItems, drainDeletes, requestStopDeleting, resetStopForTests } from "./deleteItems.js";
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
  beforeEach(() => {
    vi.clearAllMocks();
    resetStopForTests();
    vol.reset();
  });

  it("stops between items once a stop is requested and reports the rest as untouched", async () => {
    vi.mocked(deleteSafely).mockImplementationOnce(async () => {
      requestStopDeleting();
      return { ok: true, dryRun: false };
    });
    const result = await deleteItems(
      [item("npm_cache", "/f/a"), item("brew_cache", "/f/b"), item("pip_cache", "/f/c")],
      "/f",
    );
    await drainDeletes();
    expect(result.succeeded).toHaveLength(1);
    expect(result.notStarted).toHaveLength(2);
    expect(deleteSafely).toHaveBeenCalledTimes(1);
  });

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

  describe("system_data preflight", () => {
    const sd = (over: Partial<CleanupItem> = {}): CleanupItem => ({
      ...item("system_data", "/fixture/Library/Caches/com.slack.x"),
      targetId: "caches.app",
      ...over,
    });

    it("does not call trash for a preflight refusal", async () => {
      // path absent from the fs, so preflight refuses as gone
      const result = await deleteItems([sd({ path: "/fixture/Library/Caches/zzz" })], "/fixture");
      expect(deleteSafely).not.toHaveBeenCalled();
      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error.length).toBeGreaterThan(0);
    });

    it("trashes a system_data item that passes preflight", async () => {
      vol.fromJSON({ "/fixture/Library/Caches/com.slack.x/f": "x" });
      const result = await deleteItems([sd()], "/fixture");
      expect(deleteSafely).toHaveBeenCalledTimes(1);
      expect(result.succeeded).toHaveLength(1);
    });

    it("refuses when the owning app is running at delete time", async () => {
      vol.fromJSON({ "/fixture/Library/Caches/com.slack.x/f": "x" });
      vi.mocked(runningApps).mockResolvedValueOnce({ names: new Set(), bundleIds: new Set(["com.slack.x"]), ok: true });
      const result = await deleteItems([sd()], "/fixture");
      expect(deleteSafely).not.toHaveBeenCalled();
      expect(result.failed).toHaveLength(1);
    });

    it("refuses an unknown target id without trashing", async () => {
      const result = await deleteItems([sd({ targetId: undefined })], "/fixture");
      expect(deleteSafely).not.toHaveBeenCalled();
      expect(result.failed).toHaveLength(1);
    });

    it("builds one running-apps getter per batch, not per item", async () => {
      vol.fromJSON({
        "/fixture/Library/Caches/com.slack.x/f": "x",
        "/fixture/Library/Caches/b/f": "x",
        "/fixture/Library/Caches/c/f": "x",
      });
      await deleteItems([sd(), sd({ path: "/fixture/Library/Caches/b" }), sd({ path: "/fixture/Library/Caches/c" })], "/fixture");
      expect(runningApps).toHaveBeenCalledTimes(1);
    });

    it("does not probe running apps for non-system_data batches", async () => {
      await deleteItems([item("npm_cache", "/fixture/a")], "/fixture");
      expect(runningApps).not.toHaveBeenCalled();
      expect(deleteSafely).toHaveBeenCalledTimes(1);
    });
  });

  it("refuses any advisory item, whatever its category, without trashing", async () => {
    const adv = { ...item("npm_cache", "/fixture/a"), advisory: true };
    const result = await deleteItems([adv, item("brew_cache", "/fixture/b")], "/fixture");
    expect(deleteSafely).toHaveBeenCalledTimes(1);
    expect(emptyTrash).not.toHaveBeenCalled();
    expect(result.failed.map((f) => f.item)).toEqual([adv]);
    expect(result.succeeded).toHaveLength(1);
  });
});
