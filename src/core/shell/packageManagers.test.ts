import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./exec.js", () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));

import { commandExists, execCommand } from "./exec.js";
import { npmCacheDir, pnpmStorePath, yarnCacheDir } from "./packageManagers.js";

describe("package manager shell wrappers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when npm is not installed", async () => {
    vi.mocked(commandExists).mockResolvedValue(false);
    expect(await npmCacheDir()).toBeNull();
  });

  it("reads npm cache, yarn cache dir, and pnpm store path", async () => {
    vi.mocked(commandExists).mockResolvedValue(true);
    vi.mocked(execCommand).mockResolvedValue({ stdout: "/tmp/cache\n", stderr: "" });
    expect(await npmCacheDir()).toBe("/tmp/cache");
    expect(await yarnCacheDir()).toBe("/tmp/cache");
    expect(await pnpmStorePath()).toBe("/tmp/cache");
  });
});
