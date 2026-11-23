import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => {
    throw new Error("sw_vers unavailable");
  }),
}));
vi.mock("node:os", () => ({
  default: { release: () => "25.1.0" },
  release: () => "25.1.0",
}));

import { execFileSync } from "node:child_process";
import {
  compareVersions,
  currentMacOS,
  darwinToMacOS,
  inRange,
  parseProductVersion,
  setMacOSForTests,
  supportLevel,
} from "./macos.js";

const v = (s: string) => parseProductVersion(s)!;

describe("macOS version awareness", () => {
  beforeEach(() => setMacOSForTests(undefined));

  it("parses sw_vers output", () => {
    expect(parseProductVersion("27.0.1\n")).toEqual({ major: 27, minor: 0, patch: 1 });
    expect(parseProductVersion("14.6")).toEqual({ major: 14, minor: 6, patch: 0 });
    expect(parseProductVersion("garbage")).toBeNull();
  });

  it("maps Darwin releases across the Tahoe renumbering", () => {
    expect(darwinToMacOS("21.6.0")?.major).toBe(12);
    expect(darwinToMacOS("24.1.0")?.major).toBe(15);
    expect(darwinToMacOS("25.0.0")?.major).toBe(26);
    expect(darwinToMacOS("27.0.0")?.major).toBe(28);
    expect(darwinToMacOS("19.0.0")).toBeNull();
  });

  it("checks ranges with minor versions", () => {
    expect(inRange(v("15.0"), { min: "15.1" })).toBe(false);
    expect(inRange(v("15.1"), { min: "15.1" })).toBe(true);
    expect(inRange(v("26.0"), { min: "15.1" })).toBe(true);
    expect(inRange(v("15.2"), { max: "15.1" })).toBe(false);
    expect(inRange(null, { min: "14" })).toBe(false);
    expect(inRange(null, undefined)).toBe(true);
  });

  it("compares versions", () => {
    expect(compareVersions(v("15.1"), v("15.1.0"))).toBe(0);
    expect(compareVersions(v("14.9"), v("15.0"))).toBeLessThan(0);
    expect(compareVersions(v("15.0.2"), v("15.0.1"))).toBeGreaterThan(0);
  });

  it("classifies support levels", () => {
    expect(supportLevel(v("11.7"))).toBe("unsupported");
    expect(supportLevel(v("27.0.1"))).toBe("verified");
    expect(supportLevel(v("28.0"))).toBe("unverified");
    expect(supportLevel(null)).toBe("unverified");
  });

  it("uses sw_vers by absolute path and caches", () => {
    vi.mocked(execFileSync).mockReturnValueOnce("26.2\n" as never);
    expect(currentMacOS()).toEqual({ major: 26, minor: 2, patch: 0 });
    expect(currentMacOS()?.major).toBe(26);
    expect(execFileSync).toHaveBeenLastCalledWith(
      "/usr/bin/sw_vers",
      ["-productVersion"],
      expect.anything(),
    );
  });

  it("honours the test override", () => {
    setMacOSForTests(v("13.0"));
    expect(currentMacOS()?.major).toBe(13);
    setMacOSForTests(null);
    expect(currentMacOS()).toBeNull();
  });

  it("falls back to os.release when sw_vers fails", () => {
    setMacOSForTests(undefined);
    expect(currentMacOS()?.major).toBe(26);
  });
});
