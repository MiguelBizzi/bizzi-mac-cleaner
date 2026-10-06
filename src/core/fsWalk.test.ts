import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs, promises: fs.promises };
});

vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

import { fsp } from "./fs.js";
import { walk } from "./fsWalk.js";

async function pathsOf(root: string, opts?: Parameters<typeof walk>[1]): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of walk(root, opts)) out.push(entry.path);
  return out;
}

describe("fsWalk", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("walks nested directories", async () => {
    vol.fromJSON({
      "/fixture/a/b/c.txt": "hi",
      "/fixture/a/d.txt": "yo",
    });
    const paths = await pathsOf("/fixture");
    expect(paths).toEqual(expect.arrayContaining(["/fixture/a", "/fixture/a/b", "/fixture/a/b/c.txt", "/fixture/a/d.txt"]));
  });

  it("does not follow symlinks by default", async () => {
    vol.fromJSON({
      "/fixture/real/file.txt": "data",
    });
    await fsp.symlink("/fixture/real", "/fixture/link");
    const paths = await pathsOf("/fixture");
    expect(paths).toContain("/fixture/link");
    expect(paths.filter((p) => p.startsWith("/fixture/link/"))).toEqual([]);
  });

  it("skips permission-denied directories", async () => {
    vol.fromJSON({
      "/fixture/ok/file.txt": "ok",
      "/fixture/secret/hidden.txt": "nope",
    });
    await fsp.chmod("/fixture/secret", 0);
    const paths = await pathsOf("/fixture");
    expect(paths).toContain("/fixture/ok");
    expect(paths.some((p) => p.includes("hidden.txt"))).toBe(false);
  });

  it("skips directories whose scandir times out", async () => {
    vol.fromJSON({
      "/fixture/ok/file.txt": "ok",
      "/fixture/File Provider Storage/.Trash/item.txt": "cloud",
    });
    const real = fsp.readdir.bind(fsp);
    const spy = vi.spyOn(fsp, "readdir").mockImplementation(async (dir, opts) => {
      if (String(dir).includes("File Provider Storage")) {
        const err = Object.assign(new Error("ETIMEDOUT"), {
          code: "ETIMEDOUT",
          errno: -60,
          syscall: "scandir",
          path: String(dir),
        });
        throw err;
      }
      return real(dir as string, opts as { withFileTypes?: boolean });
    });
    try {
      const paths = await pathsOf("/fixture");
      expect(paths).toContain("/fixture/ok/file.txt");
      expect(paths.some((p) => p.includes("item.txt"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("does not recurse into stopAtName directories", async () => {
    vol.fromJSON({
      "/fixture/app/node_modules/pkg/index.js": "x",
      "/fixture/app/src/index.ts": "y",
    });
    const paths = await pathsOf("/fixture", { excludeNames: [], stopAtName: "node_modules" });
    expect(paths).toContain("/fixture/app/node_modules");
    expect(paths.some((p) => p.includes("pkg"))).toBe(false);
    expect(paths).toContain("/fixture/app/src/index.ts");
  });
});
