import { describe, expect, it } from "vitest";
import { daysAgo, formatBytes, formatTrashError, sizeBar, truncatePath } from "./format.js";

describe("format", () => {
  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 5)).toBe("5.0 MB");
  });

  it("computes whole days between dates", () => {
    const now = new Date("2026-09-03T00:00:00Z");
    const then = new Date("2026-08-04T00:00:00Z");
    expect(daysAgo(then, now)).toBe(30);
  });

  it("builds a size bar and truncates long paths", () => {
    expect(sizeBar(50, 100, 4)).toBe("██░░");
    expect(sizeBar(0, 100, 4)).toBe("░░░░");
    expect(truncatePath("short", 10)).toBe("short");
    const truncated = truncatePath("/very/long/path/to/file.bin", 10);
    expect(truncated.startsWith("…")).toBe(true);
    expect(truncated).toHaveLength(10);
    expect(truncated.endsWith("file.bin") || truncated.includes("file")).toBe(true);
  });

  it("extracts Finder permission messages from trash child_process errors", () => {
    const err = new Error(
      'Command failed: /bin/macos-trash /Users/me/file.mov\n“OutrasActions” couldn’t be moved to the trash because you don’t have permission to access it.',
    );
    expect(formatTrashError(err)).toContain("permission");
  });
});
