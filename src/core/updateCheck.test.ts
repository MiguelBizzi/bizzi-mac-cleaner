import { afterEach, describe, expect, it } from "vitest";
import { resetI18nForTests, setLocale, t } from "./i18n.js";
import { checkForUpdate, currentPackageVersion, isNewerVersion } from "./updateCheck.js";

describe("updateCheck", () => {
  afterEach(() => {
    resetI18nForTests();
  });

  it("reads the version from package.json", () => {
    expect(currentPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("detects a newer release and ignores equal or older ones", () => {
    expect(isNewerVersion("0.3.0", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.2.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.1.9", "0.2.0")).toBe(false);
    expect(isNewerVersion("v0.3.0", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0-beta.1")).toBe(true);
    expect(isNewerVersion("0.2.0-beta.1", "0.2.0")).toBe(false);
    expect(isNewerVersion("", "0.2.0")).toBe(false);
  });

  it("returns a notice only when the registry version is newer", async () => {
    await expect(
      checkForUpdate({ current: "0.1.0", fetchLatest: async () => "0.2.0" }),
    ).resolves.toEqual({ current: "0.1.0", latest: "0.2.0" });

    await expect(
      checkForUpdate({ current: "0.2.0", fetchLatest: async () => "0.2.0" }),
    ).resolves.toBeNull();

    await expect(
      checkForUpdate({ current: "0.3.0", fetchLatest: async () => "0.2.0" }),
    ).resolves.toBeNull();

    await expect(
      checkForUpdate({ current: "0.2.0", fetchLatest: async () => null }),
    ).resolves.toBeNull();

    await expect(
      checkForUpdate({
        current: "0.2.0",
        fetchLatest: async () => {
          throw new Error("offline");
        },
      }),
    ).resolves.toBeNull();
  });

  it("tells the user to update globally or via npx", () => {
    const en = t("app.updateAvailable", { current: "0.1.0", latest: "0.2.0" });
    expect(en).toContain("0.1.0");
    expect(en).toContain("0.2.0");
    expect(en).toContain("npm update -g bizzi-mac-cleaner");
    expect(en).toContain("npx bizzi-mac-cleaner@latest");

    setLocale("pt");
    const pt = t("app.updateAvailable", { current: "0.1.0", latest: "0.2.0" });
    expect(pt).toContain("npm update -g bizzi-mac-cleaner");
    expect(pt).toContain("npx bizzi-mac-cleaner@latest");
  });
});
