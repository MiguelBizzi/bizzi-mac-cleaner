import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("trash", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./history.js", () => ({
  appendHistory: vi.fn().mockResolvedValue(undefined),
  loadHistory: vi.fn().mockResolvedValue([]),
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import trash from "trash";
import { appendHistory } from "./history.js";
import {
  assertSafeToDelete,
  deleteSafely,
  emptyTrash,
  isDryRun,
  setDryRun,
  UnsafeDeleteError,
} from "./deleteSafely.js";

const root = "/tmp/bizzi-fixture";
const target = "/tmp/bizzi-fixture/.npm/_cacache";
const brewTarget = "/tmp/bizzi-fixture/Library/Caches/Homebrew";

describe("deleteSafely", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDryRun(undefined);
    delete process.env.BIZZI_DRY_RUN;
  });

  afterEach(() => {
    setDryRun(undefined);
    delete process.env.BIZZI_DRY_RUN;
  });

  it("does not call trash() when BIZZI_DRY_RUN is set", async () => {
    process.env.BIZZI_DRY_RUN = "1";
    expect(isDryRun()).toBe(true);
    await deleteSafely({ path: target, sizeBytes: 42, category: "npm_cache", root });
    expect(trash).not.toHaveBeenCalled();
    expect(appendHistory).toHaveBeenCalledWith(
      expect.objectContaining({ path: target, sizeBytes: 42, dryRun: true }),
    );
  });

  it("does not call trash() when setDryRun(true)", async () => {
    setDryRun(true);
    await deleteSafely({ path: brewTarget, sizeBytes: 10, category: "brew_cache", root });
    expect(trash).not.toHaveBeenCalled();
  });

  it("calls trash() when dry-run is explicitly off", async () => {
    setDryRun(false);
    await deleteSafely({ path: brewTarget, sizeBytes: 10, category: "brew_cache", root });
    expect(trash).toHaveBeenCalledWith([brewTarget]);
    expect(appendHistory).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });

  it("refuses a path that does not match its category", async () => {
    setDryRun(false);
    const result = await deleteSafely({
      path: "/tmp/bizzi-fixture/Documents",
      sizeBytes: 1,
      category: "npm_cache",
      root,
    });
    expect(result.ok).toBe(false);
    expect(trash).not.toHaveBeenCalled();
  });

  it("refuses unknown categories", () => {
    expect(() => assertSafeToDelete(target, root, "made_up")).toThrow(UnsafeDeleteError);
  });

  it("refuses largest-file paths inside macOS packages and ~/Library", () => {
    expect(() =>
      assertSafeToDelete(`${root}/Pictures/Photos Library.photoslibrary/originals/a.heic`, root, "largest_files"),
    ).toThrow(UnsafeDeleteError);
    expect(() =>
      assertSafeToDelete(`${root}/Library/Mobile Documents/x.bin`, root, "largest_files"),
    ).toThrow(UnsafeDeleteError);
    expect(() => assertSafeToDelete(`${root}/Movies/big.mov`, root, "largest_files")).not.toThrow();
  });

  it("refuses to delete the scan root", () => {
    expect(() => assertSafeToDelete(root, root)).toThrow(UnsafeDeleteError);
  });

  it("refuses paths outside the scan root", () => {
    expect(() => assertSafeToDelete("/etc/passwd", root)).toThrow(UnsafeDeleteError);
  });

  it("refuses .git internals", () => {
    expect(() => assertSafeToDelete(`${root}/proj/.git/objects/pack`, root)).toThrow(
      UnsafeDeleteError,
    );
  });

  it("refuses SSH keys and other protected secrets", () => {
    const home = os.homedir();
    expect(() => assertSafeToDelete(path.join(home, ".ssh", "id_ed25519"), home)).toThrow(
      UnsafeDeleteError,
    );
  });

  it("refuses a symlink that escapes the scan root", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bizzi-safe-"));
    try {
      const link = path.join(tmp, "escape");
      fs.symlinkSync("/etc/passwd", link);
      expect(() => assertSafeToDelete(link, tmp)).toThrow(UnsafeDeleteError);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns ok:false when trash() rejects, without throwing", async () => {
    setDryRun(false);
    vi.mocked(trash).mockRejectedValueOnce(
      new Error(
        'Command failed: macos-trash /tmp/x\n“x” couldn’t be moved to the trash because you don’t have permission to access it.',
      ),
    );
    const result = await deleteSafely({ path: brewTarget, sizeBytes: 10, category: "brew_cache", root });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("permission");
    expect(appendHistory).not.toHaveBeenCalled();
  });

  it("returns ok:false instead of throwing for paths outside the scan root", async () => {
    setDryRun(false);
    const result = await deleteSafely({
      path: "/etc/passwd",
      sizeBytes: 1,
      category: "largest_files",
      root,
    });
    expect(result.ok).toBe(false);
    expect(trash).not.toHaveBeenCalled();
  });

  it("emptyTrash dry-run never calls trash or osascript", async () => {
    setDryRun(true);
    await emptyTrash({
      path: `${root}/.Trash`,
      sizeBytes: 100,
      category: "trash_bin",
      root,
    });
    expect(trash).not.toHaveBeenCalled();
  });
});
