#!/usr/bin/env node
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";

async function writeSized(file: string, bytes: number): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.alloc(bytes, 1));
}

async function touch(file: string, when: Date): Promise<void> {
  await utimes(file, when, when);
}

async function generate(outDir: string): Promise<void> {
  const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const recent = new Date();

  const staleProject = path.join(outDir, "Projects", "stale-app");
  await writeFile(
    path.join(await mkdir(staleProject, { recursive: true }).then(() => staleProject), "package.json"),
    JSON.stringify({ name: "stale-app", version: "1.0.0" }),
  );
  await writeSized(path.join(staleProject, "node_modules", "leftpad", "index.js"), 2 * 1024 * 1024);
  await touch(path.join(staleProject, "package.json"), stale);
  await touch(staleProject, stale);

  const activeProject = path.join(outDir, "Projects", "active-app");
  await mkdir(activeProject, { recursive: true });
  await writeFile(
    path.join(activeProject, "package.json"),
    JSON.stringify({ name: "active-app", version: "1.0.0" }),
  );
  await writeSized(path.join(activeProject, "node_modules", "react", "index.js"), 3 * 1024 * 1024);
  await touch(path.join(activeProject, "package.json"), recent);
  await touch(activeProject, recent);

  await writeSized(path.join(outDir, ".npm", "_cacache", "content.blob"), 4 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Caches", "Homebrew", "foo--1.0.bottle.tar.gz"), 5 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Caches", "CocoaPods", "Pods", "cache.bin"), 1 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Caches", "pip", "wheels", "pkg.whl"), 1500 * 1024);
  await writeSized(path.join(outDir, "Library", "Caches", "typescript", "ts.buildinfo"), 256 * 1024);
  await writeSized(path.join(outDir, "Library", "Caches", "com.apple.Safari", "Cache.db"), 2 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Caches", "Google", "Chrome", "Cache", "data"), 3 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Logs", "app.log"), 512 * 1024);
  await writeSized(path.join(outDir, "Library", "HTTPStorages", "cache.db"), 800 * 1024);
  await writeSized(path.join(outDir, "Library", "WebKit", "WebsiteData", "blob"), 600 * 1024);
  await writeSized(path.join(outDir, "Library", "Safari", "Favicon Cache", "favicons.db"), 400 * 1024);
  await writeSized(path.join(outDir, "Library", "Developer", "Xcode", "iOS DeviceSupport", "18.0", "Symbols"), 4 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Developer", "Xcode", "DerivedData", "Build", "foo.o"), 6 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Developer", "Xcode", "Archives", "App.xcarchive", "dSYMs", "a"), 2 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Developer", "CoreSimulator", "Caches", "dyld.bin"), 3 * 1024 * 1024);
  await writeSized(path.join(outDir, "Library", "Caches", "com.docker.docker", "log.txt"), 1024 * 1024);
  await writeSized(path.join(outDir, ".gradle", "caches", "modules-2", "files-2.1", "a.jar"), 2500 * 1024);
  await writeSized(path.join(outDir, ".cargo", "registry", "cache", "crate.crate"), 1800 * 1024);
  await writeSized(path.join(outDir, ".cargo", "registry", "src", "crate", "lib.rs"), 400 * 1024);
  await writeSized(path.join(outDir, ".Trash", "old-screenshot.png"), 700 * 1024);
  await writeSized(path.join(outDir, "Movies", "huge-clip.mov"), 12 * 1024 * 1024);
  await writeSized(path.join(outDir, "Documents", "nested", "deep", "dump.bin"), 8 * 1024 * 1024);
  await writeSized(path.join(outDir, "Downloads", "installer.dmg"), 9 * 1024 * 1024);
}

const program = new Command();
program
  .option("--out <path>", "Directory to write the fixture into (created if missing)")
  .action(async (opts: { out?: string }) => {
    const out = opts.out
      ? path.resolve(opts.out)
      : await mkdtemp(path.join(os.tmpdir(), "bizzi-mac-cleaner-"));
    await mkdir(out, { recursive: true });
    await generate(out);
    console.log(out);
  });

program.parseAsync(process.argv);
