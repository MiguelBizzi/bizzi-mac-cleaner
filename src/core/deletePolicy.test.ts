import { describe, expect, it } from "vitest";
import { categoryViolation } from "./deletePolicy.js";

const root = "/h";
const ok = (c: string, p: string) => expect(categoryViolation(c, p, root)).toBeNull();
const bad = (c: string, p: string) => expect(categoryViolation(c, p, root)).not.toBeNull();

describe("categoryViolation", () => {
  it("accepts the exact shapes scanners produce", () => {
    ok("node_modules", "/h/proj/node_modules");
    ok("npm_cache", "/h/.npm/_cacache");
    ok("xcode_derived_data", "/h/Library/Developer/Xcode/DerivedData");
    ok("system_caches_logs", "/h/Library/Caches/com.foo.bar");
    ok("system_caches_logs", "/h/Library/Logs");
    ok("simulator_caches", "/h/Library/Developer/CoreSimulator/Devices/12345678-1234-1234-1234-123456789ABC");
    ok("cargo_cache", "/h/.cargo/registry/cache");
    ok("trash_bin", "/h/.Trash");
  });

  it("rejects user-data paths dressed up as a cache category", () => {
    bad("node_modules", "/h/Documents");
    bad("npm_cache", "/h/Documents");
    bad("xcode_derived_data", "/h/Library/Developer/Xcode");
    bad("system_caches_logs", "/h/Library/Application Support/Foo");
    bad("system_caches_logs", "/h/Library/Mobile Documents");
    bad("simulator_caches", "/h/Library/Developer/CoreSimulator/Devices");
    bad("trash_bin", "/h/Documents");
    bad("docker_unused", "/h/Library/Containers/com.docker.docker/Data/vms");
  });

  it("rejects unknown categories and paths outside the root", () => {
    bad("nope", "/h/x");
    bad("npm_cache", "/elsewhere/.npm");
    bad("npm_cache", "/h");
  });
});
