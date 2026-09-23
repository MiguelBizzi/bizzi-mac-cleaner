import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isProtectedPath, isSafeScanRoot } from "./paths.js";

describe("isProtectedPath", () => {
  it("blocks the filesystem root and the user's home directory", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath(os.homedir())).toBe(true);
  });

  it("blocks macOS system prefixes", () => {
    expect(isProtectedPath("/System/Library/CoreServices")).toBe(true);
    expect(isProtectedPath("/usr/bin/ssh")).toBe(true);
    expect(isProtectedPath("/Library/Preferences")).toBe(true);
    expect(isProtectedPath("/private/etc/passwd")).toBe(true);
  });

  it("blocks secrets even when nested under a project tree", () => {
    expect(isProtectedPath(path.join(os.homedir(), ".ssh", "id_ed25519"))).toBe(true);
    expect(isProtectedPath("/tmp/proj/.gnupg/private-keys-v1.d")).toBe(true);
    expect(isProtectedPath(path.join(os.homedir(), "Library", "Keychains", "login.keychain-db"))).toBe(
      true,
    );
  });

  it("allows developer caches under the home Library folder", () => {
    expect(isProtectedPath(path.join(os.homedir(), "Library", "Caches", "Homebrew"))).toBe(false);
    expect(isProtectedPath("/tmp/bizzi-fixture/Caches/npm")).toBe(false);
  });
});

describe("isSafeScanRoot", () => {
  it("allows home and fixture directories", () => {
    expect(isSafeScanRoot(os.homedir())).toBe(true);
    expect(isSafeScanRoot("/tmp/bizzi-fixture")).toBe(true);
  });

  it("rejects machine-wide and system roots", () => {
    expect(isSafeScanRoot("/")).toBe(false);
    expect(isSafeScanRoot("/Users")).toBe(false);
    expect(isSafeScanRoot("/System")).toBe(false);
    expect(isSafeScanRoot("/usr")).toBe(false);
  });

  it("rejects a secrets directory as the scan root", () => {
    expect(isSafeScanRoot(path.join(os.homedir(), ".ssh"))).toBe(false);
  });
});
