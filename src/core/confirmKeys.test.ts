import { describe, expect, it } from "vitest";
import { confirmKeyAction } from "./confirmKeys.js";

const none = { return: false, escape: false };

describe("confirmKeyAction", () => {
  it("confirms only on y", () => {
    expect(confirmKeyAction("y", none)).toBe("confirm");
  });
  it("never confirms on Enter (it opens the modal, a held Enter would delete)", () => {
    expect(confirmKeyAction("", { return: true, escape: false })).toBeNull();
    expect(confirmKeyAction("\r", { return: true, escape: false })).toBeNull();
  });
  it("cancels on n or escape", () => {
    expect(confirmKeyAction("n", none)).toBe("cancel");
    expect(confirmKeyAction("", { return: false, escape: true })).toBe("cancel");
  });
  it("ignores other keys", () => {
    expect(confirmKeyAction("x", none)).toBeNull();
  });
});
