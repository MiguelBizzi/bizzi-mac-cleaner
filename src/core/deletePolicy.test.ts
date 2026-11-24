import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fs as memfs, vol } from "memfs";

vi.mock("./fs.js", () => ({ fs: memfs, fsp: memfs.promises }));

import { TARGETS, findNeverTarget } from "../systemData/catalog.js";
import { setMacOSForTests } from "../systemData/macos.js";
import { samplePath } from "../systemData/match.js";
import { categoryViolation } from "./deletePolicy.js";

const root = "/h";
const ok = (c: string, p: string) => expect(categoryViolation(c, p, root)).toBeNull();
const bad = (c: string, p: string) => expect(categoryViolation(c, p, root)).not.toBeNull();

beforeEach(() => {
  vol.reset();
  setMacOSForTests({ major: 27, minor: 0, patch: 0 });
});
afterEach(() => setMacOSForTests(undefined));

describe("categoryViolation", () => {
  it("accepts the exact shapes scanners produce", () => {
    ok("node_modules", "/h/proj/node_modules");
    ok("npm_cache", "/h/.npm/_cacache");
    ok("xcode_derived_data", "/h/Library/Developer/Xcode/DerivedData");
    ok("simulator_caches", "/h/Library/Developer/CoreSimulator/Devices/12345678-1234-1234-1234-123456789ABC");
    ok("cargo_cache", "/h/.cargo/registry/cache");
    ok("trash_bin", "/h/.Trash");
  });

  it("rejects user-data paths dressed up as a cache category", () => {
    bad("node_modules", "/h/Documents");
    bad("npm_cache", "/h/Documents");
    bad("xcode_derived_data", "/h/Library/Developer/Xcode");
    bad("simulator_caches", "/h/Library/Developer/CoreSimulator/Devices");
    bad("trash_bin", "/h/Documents");
    bad("docker_unused", "/h/Library/Containers/com.docker.docker/Data/vms");
  });

  it("rejects unknown categories and paths outside the root", () => {
    bad("nope", "/h/x");
    bad("npm_cache", "/elsewhere/.npm");
    bad("npm_cache", "/h");
  });

  it("allows catalog targets under system_data", () => {
    expect(categoryViolation("system_data", "/h/Library/Caches/com.tinyspeck.slackmacgap", "/h")).toBeNull();
    expect(
      categoryViolation("system_data", "/h/Library/Developer/Xcode/iOS DeviceSupport/iPhone15,2 17.1 (21B80)", "/h"),
    ).toBeNull();
  });

  it("refuses never targets for every category", () => {
    expect(categoryViolation("system_data", "/h/Library/Caches/com.apple.bird", "/h")).toMatch(/never removed/);
    expect(
      categoryViolation("node_modules", "/h/Library/Mobile Documents/com~apple~CloudDocs/app/node_modules", "/h"),
    ).toMatch(/never removed/);
  });

  it("refuses parents of cleanable items", () => {
    expect(categoryViolation("system_data", "/h/Library/Caches", "/h")).not.toBeNull();
    expect(categoryViolation("system_data", "/h/Library/Application Support/MobileSync/Backup", "/h")).not.toBeNull();
  });

  it("refuses a catalog path whose real location is elsewhere", () => {
    vol.fromJSON({ "/h/Documents/taxes/a.pdf": "x" });
    vol.mkdirSync("/h/Library", { recursive: true });
    vol.symlinkSync("/h/Documents", "/h/Library/Caches");
    expect(categoryViolation("system_data", "/h/Library/Caches/taxes", "/h")).not.toBeNull();
  });

  it("refuses a path whose real location is a never target", () => {
    vol.fromJSON({ "/h/Library/Messages/Attachments/a": "x" });
    vol.symlinkSync("/h/Library/Messages/Attachments", "/h/Library/Logs");
    expect(categoryViolation("system_data", "/h/Library/Logs/a", "/h")).toMatch(/never removed/);
  });

  it("refuses targets outside their macOS range", () => {
    setMacOSForTests({ major: 11, minor: 7, patch: 0 });
    expect(categoryViolation("system_data", "/h/Library/Logs/DiagnosticReports", "/h")).toMatch(/unsupported/);
  });

  it("no longer knows system_caches_logs", () => {
    expect(categoryViolation("system_caches_logs", "/h/Library/Logs", "/h")).toMatch(/unknown cleanup category/);
  });

  it("refuses system_data paths that match no catalog target", () => {
    expect(categoryViolation("system_data", "/h/Documents/a", "/h")).toMatch(/System Data/);
    expect(categoryViolation("system_data", "/h/Library/Application Support/Foo", "/h")).not.toBeNull();
  });
});

const NEVER_SAMPLES: [string, string][] = [
  ["never.cloud_files", "Library/Mobile Documents/x"],
  ["never.cloud_files", "Library/CloudStorage/Dropbox/x"],
  ["never.identity_sync", "Library/Caches/com.apple.bird/x"],
  ["never.identity_sync", "Library/Caches/CloudKit/x"],
  ["never.identity_sync", "Library/Caches/com.apple.akd/x"],
  ["never.identity_sync", "Library/Caches/com.apple.amsaccountsd/x"],
  ["never.identity_sync", "Library/Caches/com.apple.AuthenticationServices.foo/x"],
  ["never.identity_sync", "Library/Caches/FamilyCircle/x"],
  ["never.identity_sync", "Library/Caches/com.apple.HomeKit/x"],
  ["never.identity_sync", "Library/Caches/PassKit/x"],
  ["never.identity_sync", "Library/Caches/com.apple.passd/x"],
  ["never.identity_sync", "Library/Caches/com.apple.iCloudHelper/x"],
  ["never.in_flight", "Library/Caches/com.apple.nsurlsessiond/x"],
  ["never.in_flight", "Library/Caches/TemporaryItems/x"],
  ["never.personal_data", "Library/Messages/x"],
  ["never.personal_data", "Library/Mail/x"],
  ["never.personal_data", "Library/Photos/x"],
  ["never.personal_data", "Library/Calendars/x"],
  ["never.personal_data", "Library/Application Support/AddressBook/x"],
  ["never.personal_data", "Library/Keychains/x"],
  ["never.personal_data", "Library/Cookies/x"],
  ["never.personal_data", "Library/Accounts/x"],
  ["never.personal_data", "Library/Preferences/x"],
  ["never.group_containers", "Library/Group Containers/x"],
  ["never.vm_internals", "Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw"],
  ["never.vm_internals", ".ollama/models/blobs/sha256-x"],
  ["never.vm_internals", ".ollama/models/manifests/x"],
  ["never.vm_internals", ".colima/default/x"],
  ["never.roots", "Library"],
  ["never.roots", "Library/Caches"],
  ["never.roots", "Library/Application Support"],
  ["never.roots", "Library/Containers"],
  ["never.roots", "Library/Application Support/MobileSync"],
  ["never.roots", "Library/Application Support/MobileSync/Backup"],
  ["never.roots", "Library/Developer/CoreSimulator/Devices"],
];

describe("never list pins", () => {
  it("covers every relative never pattern with a concrete sample", () => {
    for (const t of TARGETS.filter((t) => t.safety === "never"))
      for (const p of t.patterns.filter((p) => !p.startsWith("/"))) {
        const hit = NEVER_SAMPLES.some(([id, s]) => id === t.id && findNeverTarget(s.split("/"), `/h/${s}`)?.id === t.id);
        expect(hit, `${t.id}: ${p} (sample ${samplePath(p).join("/")})`).toBe(true);
      }
  });

  it.each(NEVER_SAMPLES)("refuses %s: %s for system_data and another category", (id, rel) => {
    const label = new RegExp(`is never removed`);
    expect(findNeverTarget(rel.split("/"), `/h/${rel}`)?.id).toBe(id);
    for (const cat of ["system_data", "node_modules"]) {
      const msg = categoryViolation(cat, `/h/${rel}`, "/h");
      expect(msg, `${cat} ${rel}`).toMatch(label);
    }
  });

  it("refuses with the English label and reason", () => {
    expect(categoryViolation("system_data", "/h/Library/Messages/x", "/h")).toBe(
      '"Personal data and settings" is never removed: ' +
        require_en("sd.never.personal_data.why"),
    );
  });

  it("matches absolute never patterns against absolute paths", () => {
    expect(findNeverTarget([], "/System/Library/x")?.id).toBe("never.os");
    expect(findNeverTarget([], "/private/var/folders/ab/cd")?.id).toBe("never.os");
    expect(findNeverTarget([], "/Users/me/System/x")).toBeUndefined();
  });

  it("matches never patterns case-insensitively (APFS default)", () => {
    expect(findNeverTarget("library/mobile documents/x".split("/"), "/h/library/mobile documents/x")?.id).toBe(
      "never.cloud_files",
    );
    expect(findNeverTarget([], "/system/library/x")?.id).toBe("never.os");
    expect(categoryViolation("system_data", "/h/LIBRARY/Caches/COM.APPLE.BIRD", "/h")).toMatch(/never removed/);
  });
});

import en from "../locales/en.json" with { type: "json" };
function require_en(key: string): string {
  return (en as Record<string, string>)[key] as string;
}
