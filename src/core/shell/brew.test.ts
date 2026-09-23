import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./exec.js", () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));

import { commandExists, execCommand } from "./exec.js";
import { brewCacheDir, brewCleanupDryRun } from "./brew.js";

describe("brew shell wrapper", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when brew is not installed", async () => {
    vi.mocked(commandExists).mockResolvedValue(false);
    expect(await brewCacheDir()).toBeNull();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("returns the trimmed cache path", async () => {
    vi.mocked(commandExists).mockResolvedValue(true);
    vi.mocked(execCommand).mockResolvedValue({
      stdout: "/Users/me/Library/Caches/Homebrew\n",
      stderr: "",
    });
    expect(await brewCacheDir()).toBe("/Users/me/Library/Caches/Homebrew");
  });

  it("returns cleanup dry-run output", async () => {
    vi.mocked(commandExists).mockResolvedValue(true);
    vi.mocked(execCommand).mockResolvedValue({
      stdout: "Would remove: foo",
      stderr: "",
    });
    expect(await brewCleanupDryRun()).toContain("Would remove");
  });
});
