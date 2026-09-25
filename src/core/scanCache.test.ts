import { describe, expect, it } from "vitest";
import { isReusableScan, type ScanSnapshot } from "./scanCache.js";
import type { CleanupItem } from "../scanners/types.js";

const item: CleanupItem = {
  id: "npm:a",
  category: "npm_cache",
  path: "/a",
  sizeBytes: 10,
  lastModified: new Date(0),
  risk: "safe",
};

const done: ScanSnapshot = {
  items: [item],
  done: true,
  root: "/Users/me",
  staleDays: 30,
};

describe("isReusableScan", () => {
  it("reuses a completed scan for the same root and staleDays", () => {
    expect(isReusableScan(done, { root: "/Users/me", staleDays: 30 })).toBe(true);
  });

  it("does not reuse an in-progress or missing snapshot", () => {
    expect(isReusableScan(undefined, { root: "/Users/me", staleDays: 30 })).toBe(false);
    expect(isReusableScan({ ...done, done: false }, { root: "/Users/me", staleDays: 30 })).toBe(false);
  });

  it("invalidates when scan parameters change", () => {
    expect(isReusableScan(done, { root: "/Users/other", staleDays: 30 })).toBe(false);
    expect(isReusableScan(done, { root: "/Users/me", staleDays: 14 })).toBe(false);
  });

  it("checks largestFilesCount only when that screen asks for it", () => {
    const largest = { ...done, largestFilesCount: 50 };
    expect(isReusableScan(largest, { root: "/Users/me", staleDays: 30 })).toBe(true);
    expect(isReusableScan(largest, { root: "/Users/me", staleDays: 30, largestFilesCount: 50 })).toBe(true);
    expect(isReusableScan(largest, { root: "/Users/me", staleDays: 30, largestFilesCount: 20 })).toBe(false);
  });
});
