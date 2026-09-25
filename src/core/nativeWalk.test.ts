import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { arch } from "node:process";
import { describe, expect, it } from "vitest";

const triple = arch === "arm64" ? "darwin-arm64" : arch === "x64" ? "darwin-x64" : null;
const addonPath = triple
  ? path.resolve(process.cwd(), "native", `bizzi-walker.${triple}.node`)
  : "";

describe("native directorySize", () => {
  it.skipIf(!addonPath || !existsSync(addonPath))("sums logical file sizes on a real tree", async () => {
    const require = createRequire(import.meta.url);
    const native = require(addonPath) as {
      directorySize(dir: string): Promise<number>;
    };
    const dir = await mkdtemp(path.join(tmpdir(), "bizzi-native-"));
    try {
      await mkdir(path.join(dir, "nested"));
      await writeFile(path.join(dir, "a.txt"), "aaaa");
      await writeFile(path.join(dir, "nested", "b.txt"), "bb");
      expect(await native.directorySize(dir)).toBe(6);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
