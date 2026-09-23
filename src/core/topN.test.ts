import { describe, expect, it } from "vitest";
import { TopN } from "./topN.js";

describe("TopN", () => {
  it("keeps the largest N items in descending order", () => {
    const top = new TopN<{ n: number }>(3, (x) => x.n);
    for (const n of [1, 9, 3, 7, 2, 8, 4]) top.push({ n });
    expect(top.toArray().map((x) => x.n)).toEqual([9, 8, 7]);
  });

  it("ignores values at or below the current minimum once full", () => {
    const top = new TopN<number>(2, (n) => n);
    top.push(5);
    top.push(10);
    top.push(5);
    top.push(4);
    expect(top.toArray()).toEqual([10, 5]);
    expect(top.minScore).toBe(5);
  });

  it("accepts a replacement that beats the minimum", () => {
    const top = new TopN<number>(2, (n) => n);
    top.push(1);
    top.push(2);
    top.push(3);
    expect(top.toArray()).toEqual([3, 2]);
  });
});
