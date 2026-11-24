import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocale, resetI18nForTests, setLocale, t } from "./i18n.js";

describe("i18n", () => {
  afterEach(() => {
    resetI18nForTests();
  });

  it("falls back to en when a key is missing in another locale", () => {
    setLocale("pt");
    expect(getLocale()).toBe("pt");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(t("test.onlyInEn")).toBe("english-only-key");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("interpolates variables", () => {
    expect(t("scan.selected", { size: "1 GB", count: 3 })).toContain("1 GB");
  });

  it("resolves success-screen strings", () => {
    expect(t("confirm.successTitle")).toBe("Success");
    expect(t("confirm.success", { size: "1 GB", count: 2 })).toContain("1 GB");
    expect(t("confirm.failTitle")).toBe("Could not send to Trash");
    expect(t("empty.title")).toBe("Empty Trash?");
    expect(t("empty.typePrompt", { phrase: "empty" })).toContain("empty");
    expect(t("confirm.nextList")).toContain("back to the list");
  });

  it("documents the rescan shortcut on scan screens", () => {
    expect(t("scan.hint")).toContain("r rescan");
    expect(t("largest.hint")).toContain("r rescan");
  });

  it("documents the explain shortcut on the scan screen in every locale", () => {
    expect(t("scan.hint")).toContain("? explain");
    setLocale("pt");
    expect(t("scan.hint")).toContain("? explicar");
  });
});
