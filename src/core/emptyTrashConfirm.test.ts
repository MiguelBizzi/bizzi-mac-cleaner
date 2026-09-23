import { describe, expect, it } from "vitest";
import {
  EMPTY_TRASH_CONFIRM_PHRASE,
  isEmptyTrashConfirm,
  matchesEmptyTrashConfirm,
} from "./emptyTrashConfirm.js";

describe("emptyTrashConfirm", () => {
  it("detects Empty Trash from kind or trash_bin items", () => {
    expect(isEmptyTrashConfirm("emptyTrash", [])).toBe(true);
    expect(isEmptyTrashConfirm("delete", [{ category: "trash_bin" }])).toBe(true);
    expect(isEmptyTrashConfirm("delete", [{ category: "npm_cache" }])).toBe(false);
  });

  it("accepts the phrase case-insensitively with surrounding space", () => {
    expect(matchesEmptyTrashConfirm(EMPTY_TRASH_CONFIRM_PHRASE)).toBe(true);
    expect(matchesEmptyTrashConfirm(" EMPTY ")).toBe(true);
    expect(matchesEmptyTrashConfirm("y")).toBe(false);
    expect(matchesEmptyTrashConfirm("yes")).toBe(false);
    expect(matchesEmptyTrashConfirm("empt")).toBe(false);
  });
});
