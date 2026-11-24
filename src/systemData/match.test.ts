import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs, promises: fs.promises };
});
vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

import { fsp } from "../core/fs.js";
import {
  excludedBy,
  expandPattern,
  firstWildcardValue,
  matchPattern,
  relSegments,
  samplePath,
} from "./match.js";

describe("relSegments", () => {
  it("splits paths under root and rejects outside paths", () => {
    expect(relSegments("/h", "/h/Library/Caches")).toEqual(["Library", "Caches"]);
    expect(relSegments("/h", "/h")).toEqual([]);
    expect(relSegments("/h", "/h2/x")).toBeNull();
    expect(relSegments("/h", "/x")).toBeNull();
    expect(relSegments("/h/", "/h/a")).toEqual(["a"]);
    expect(relSegments("/h", "/h/../x")).toBeNull();
  });
});

describe("matchPattern", () => {
  it("matches single-segment wildcards and in-segment globs", () => {
    expect(matchPattern("Library/Caches/*", ["Library", "Caches", "com.foo"])).toBe(true);
    expect(matchPattern("Library/Caches/*", ["Library", "Caches", "a", "b"])).toBe(false);
    expect(matchPattern("Library/Caches/*", ["Library", "Caches"])).toBe(false);
    expect(matchPattern("Library/Caches/com.apple.*", ["Library", "Caches", "com.apple.Safari"])).toBe(true);
    expect(
      matchPattern("Library/iTunes/iPhone Software Updates/*.ipsw", ["Library", "iTunes", "iPhone Software Updates", "x.ipsw"]),
    ).toBe(true);
  });
  it("treats regex metacharacters in patterns literally", () => {
    expect(matchPattern("Library/Caches/com.apple.*", ["Library", "Caches", "comXapple.y"])).toBe(false);
    expect(matchPattern("a/(b)+/*", ["a", "(b)+", "z"])).toBe(true);
    expect(matchPattern("a/(b)+/*", ["a", "bb", "z"])).toBe(false);
  });
  it("keeps regex metacharacters literal when mixed with * in one segment", () => {
    expect(matchPattern("a(b)+*", ["a(b)+xyz"])).toBe(true);
    expect(matchPattern("a(b)+*", ["a(b)+"])).toBe(true);
    expect(matchPattern("a(b)+*", ["abbxyz"])).toBe(false);
    expect(matchPattern("a(b)+*", ["a(b)xyz"])).toBe(false);
    expect(matchPattern("x.[y]?*", ["x.[y]?z"])).toBe(true);
    expect(matchPattern("x.[y]?*", ["xa[y]?z"])).toBe(false);
  });
  it("matches UUID segments only", () => {
    const p = "Library/Developer/CoreSimulator/Devices/<uuid>";
    const base = ["Library", "Developer", "CoreSimulator", "Devices"];
    expect(matchPattern(p, [...base, "A1B2C3D4-0000-1111-2222-333344445555"])).toBe(true);
    expect(matchPattern(p, [...base, "device_set.plist"])).toBe(false);
  });
  it("treats trailing ** as subtree", () => {
    expect(matchPattern("Library/Mobile Documents/**", ["Library", "Mobile Documents"])).toBe(true);
    expect(matchPattern("Library/Mobile Documents/**", ["Library", "Mobile Documents", "a", "b"])).toBe(true);
    expect(matchPattern("Library/Mobile Documents/**", ["Library", "Mobile"])).toBe(false);
  });
  it("combines in-segment globs with a trailing subtree", () => {
    const p = "Library/Caches/com.apple.AuthenticationServices*/**";
    expect(matchPattern(p, ["Library", "Caches", "com.apple.AuthenticationServices.x", "a", "b"])).toBe(true);
    expect(matchPattern(p, ["Library", "Caches", "com.apple.AuthenticationServices"])).toBe(true);
    expect(matchPattern(p, ["Library", "Caches", "com.apple.Other", "a"])).toBe(false);
  });
  it("handles absolute patterns: leading '/' is dropped, callers pass the path split on '/' minus the leading empty segment", () => {
    expect(matchPattern("/System/**", ["System"])).toBe(true);
    expect(matchPattern("/System/**", ["System", "Library", "x"])).toBe(true);
    expect(matchPattern("/System/**", ["Library"])).toBe(false);
    expect(matchPattern("/System/Volumes/*", ["System", "Volumes", "Data"])).toBe(true);
    // a relative pattern never matches an absolute path's segments by accident of the leading slash
    expect(matchPattern("/System/**", ["", "System"])).toBe(false);
  });
  it("matches the root itself only for a bare ** pattern", () => {
    expect(matchPattern("**", [])).toBe(true);
    expect(matchPattern("a", [])).toBe(false);
  });
});

describe("firstWildcardValue", () => {
  it("returns the segment matched by the first wildcard or glob", () => {
    expect(firstWildcardValue("Library/Caches/*", ["Library", "Caches", "com.foo"])).toBe("com.foo");
    expect(firstWildcardValue("Library/Caches/*/x/*", ["Library", "Caches", "a", "x", "b"])).toBe("a");
    expect(firstWildcardValue("Library/*.ipsw", ["Library", "x.ipsw"])).toBe("x.ipsw");
    expect(firstWildcardValue("Library/Caches/foo", ["Library", "Caches", "foo"])).toBeUndefined();
    expect(firstWildcardValue("/Users/*/x", ["Users", "me", "x"])).toBe("me");
    expect(firstWildcardValue("Library/Caches/*", ["Library"])).toBeUndefined();
  });
});

describe("excludedBy", () => {
  it("checks exclude globs against every wildcard segment value", () => {
    expect(excludedBy("Library/Caches/*", ["Library", "Caches", "com.apple.x"], ["com.apple.*"])).toBe(true);
    expect(excludedBy("Library/Caches/*", ["Library", "Caches", "a"], ["com.apple.*"])).toBe(false);
    // literal segments are never excluded
    expect(excludedBy("com.apple.x/*", ["com.apple.x", "a"], ["com.apple.*"])).toBe(false);
    expect(excludedBy("Library/Caches/*", ["Library", "Caches", "a"], undefined)).toBe(false);
  });
});

describe("samplePath", () => {
  it("builds a path that matches its own pattern", () => {
    expect(samplePath("Library/Caches/*")).toEqual(["Library", "Caches", "sample"]);
    expect(samplePath("Library/*.ipsw")).toEqual(["Library", "sample.ipsw"]);
    expect(samplePath("a/<uuid>/b/**")).toEqual(["a", "00000000-0000-0000-0000-000000000000", "b"]);
    expect(samplePath("/System/**")).toEqual(["System"]);
    const p = "Library/Caches/com.apple.AuthenticationServices*/**";
    expect(matchPattern(p, samplePath(p))).toBe(true);
  });
});

describe("expandPattern", () => {
  beforeEach(() => vol.reset());
  afterEach(() => vi.restoreAllMocks());

  it("expands patterns against memfs, honouring exclude and skipping symlinks", async () => {
    vol.fromJSON({ "/h/Library/Caches/a/f": "1", "/h/Library/Caches/com.apple.x/f": "1", "/h/Documents/d": "1" });
    vol.symlinkSync("/h/Documents", "/h/Library/Caches/link");
    const r = await expandPattern("/h", "Library/Caches/*", ["com.apple.*"]);
    expect(r.paths).toEqual(["/h/Library/Caches/a"]);
    expect(r.denied).toEqual([]);
  });

  it("returns sorted paths and handles in-segment globs", async () => {
    vol.fromJSON({ "/h/L/z.ipsw": "1", "/h/L/a.ipsw": "1", "/h/L/m.txt": "1" });
    expect((await expandPattern("/h", "L/*.ipsw")).paths).toEqual(["/h/L/a.ipsw", "/h/L/z.ipsw"]);
  });

  it("expands multiple wildcard levels and a trailing ** to the base directory", async () => {
    vol.fromJSON({ "/h/L/a/Cache/f": "1", "/h/L/b/Cache/f": "1", "/h/L/c/Other/f": "1" });
    expect((await expandPattern("/h", "L/*/Cache")).paths).toEqual(["/h/L/a/Cache", "/h/L/b/Cache"]);
    expect((await expandPattern("/h", "L/*/Cache/**")).paths).toEqual(["/h/L/a/Cache", "/h/L/b/Cache"]);
  });

  it("matches UUID segments", async () => {
    vol.fromJSON({
      "/h/D/A1B2C3D4-0000-1111-2222-333344445555/x": "1",
      "/h/D/device_set.plist": "1",
    });
    expect((await expandPattern("/h", "D/<uuid>")).paths).toEqual(["/h/D/A1B2C3D4-0000-1111-2222-333344445555"]);
  });

  it("yields nothing for missing directories and non-directories", async () => {
    vol.fromJSON({ "/h/file": "1" });
    expect(await expandPattern("/h", "nope/*")).toEqual({ paths: [], denied: [] });
    expect(await expandPattern("/h", "file/*")).toEqual({ paths: [], denied: [] });
    expect(await expandPattern("/h", "file/sub")).toEqual({ paths: [], denied: [] });
  });

  it("does not follow symlinks at any level, including literal segments", async () => {
    vol.fromJSON({ "/h/real/Cache/f": "1", "/h/L/own/f": "1" });
    vol.symlinkSync("/h/real", "/h/L/linkdir");
    vol.symlinkSync("/h/real/Cache", "/h/L/own/Cache");
    // symlinked intermediate (wildcard) dir is skipped
    expect((await expandPattern("/h", "L/*/Cache")).paths).toEqual([]);
    // symlinked intermediate literal dir is skipped
    expect((await expandPattern("/h", "L/linkdir/Cache")).paths).toEqual([]);
    // symlinked final literal is skipped
    expect((await expandPattern("/h", "L/own/Cache")).paths).toEqual([]);
  });

  it("reports EPERM/EACCES readdir failures as denied", async () => {
    vol.fromJSON({ "/h/Library/Safari/x": "1", "/h/Library/Mail/y": "1" });
    const real = fsp.readdir.bind(fsp);
    vi.spyOn(fsp, "readdir").mockImplementation(((p: string, ...rest: unknown[]) => {
      if (p === "/h/Library/Safari") return Promise.reject(Object.assign(new Error("denied"), { code: "EPERM" }));
      if (p === "/h/Library/Mail") return Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" }));
      return (real as (...a: unknown[]) => Promise<unknown>)(p, ...rest);
    }) as never);
    const r = await expandPattern("/h", "Library/*/*");
    expect(r.paths).toEqual([]);
    expect(r.denied).toEqual(["/h/Library/Mail", "/h/Library/Safari"]);
  });

  it("reports a TCC-protected literal child (lstat EPERM) as its parent being denied", async () => {
    vol.fromJSON({ "/h/Library/Safari/x": "1" });
    const real = fsp.lstat.bind(fsp);
    vi.spyOn(fsp, "lstat").mockImplementation(((p: string, ...rest: unknown[]) => {
      if (p === "/h/Library/Safari/Favicon Cache")
        return Promise.reject(Object.assign(new Error("denied"), { code: "EPERM" }));
      return (real as (...a: unknown[]) => Promise<unknown>)(p, ...rest);
    }) as never);
    const r = await expandPattern("/h", "Library/Safari/Favicon Cache");
    expect(r.paths).toEqual([]);
    expect(r.denied).toEqual(["/h/Library/Safari"]);
  });

  it("ignores other errors silently", async () => {
    vol.fromJSON({ "/h/a/x": "1" });
    vi.spyOn(fsp, "readdir").mockRejectedValue(Object.assign(new Error("io"), { code: "EIO" }));
    expect(await expandPattern("/h", "a/*")).toEqual({ paths: [], denied: [] });
  });
});
