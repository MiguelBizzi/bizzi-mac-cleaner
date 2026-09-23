import { describe, expect, it } from "vitest";
import { acceptDiscoveredPath } from "./helpers.js";

describe("acceptDiscoveredPath", () => {
  it("keeps a path that matches the tool hint", () => {
    expect(acceptDiscoveredPath("/Users/me/Library/Caches/Homebrew", /homebrew/i)).toBe(
      "/Users/me/Library/Caches/Homebrew",
    );
  });

  it("drops a hijacked binary pointing at unrelated user data", () => {
    expect(acceptDiscoveredPath("/Users/me/Documents", /homebrew/i)).toBeNull();
    expect(acceptDiscoveredPath("/Users/me/.ssh", /npm/i)).toBeNull();
  });
});
