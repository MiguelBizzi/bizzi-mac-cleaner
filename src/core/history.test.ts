import { vol } from "memfs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs, promises: fs.promises };
});
vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

import { appendHistory, loadHistory } from "./history.js";

describe("history", () => {
  beforeEach(() => vol.reset());

  it("appends entries and loads them back", async () => {
    const entry = {
      at: "2026-09-03T00:00:00.000Z",
      path: "/fixture/a",
      sizeBytes: 12,
      category: "npm_cache",
      dryRun: true,
    };
    await appendHistory(entry);
    const file = path.join(os.homedir(), ".config", "bizzi-mac-cleaner", "history.json");
    expect(vol.existsSync(file)).toBe(true);
    const loaded = await loadHistory();
    expect(loaded).toEqual([entry]);
    await appendHistory({ ...entry, path: "/fixture/b" });
    expect((await loadHistory()).map((e) => e.path)).toEqual(["/fixture/a", "/fixture/b"]);
  });

  it("drops oldest entries once history exceeds 500", async () => {
    const file = path.join(os.homedir(), ".config", "bizzi-mac-cleaner", "history.json");
    const entries = Array.from({ length: 500 }, (_, i) => ({
      at: "2026-09-03T00:00:00.000Z",
      path: `/fixture/${i}`,
      sizeBytes: 1,
      category: "npm_cache",
      dryRun: true,
    }));
    vol.fromJSON({ [file]: JSON.stringify({ entries }) });
    await appendHistory({ ...entries[0]!, path: "/fixture/new" });
    const loaded = await loadHistory();
    expect(loaded).toHaveLength(500);
    expect(loaded[0]?.path).toBe("/fixture/1");
    expect(loaded.at(-1)?.path).toBe("/fixture/new");
  });
});
