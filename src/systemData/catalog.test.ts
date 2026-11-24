import { describe, expect, it } from "vitest";
import en from "../locales/en.json" with { type: "json" };
import pt from "../locales/pt.json" with { type: "json" };
import { categoryViolation } from "../core/deletePolicy.js";
import { TARGETS, findDeletableTarget, findNeverTarget, targetById } from "./catalog.js";
import { samplePath } from "./match.js";

const LOCALES: Record<string, string>[] = [en as Record<string, string>, pt as Record<string, string>];
const deletable = TARGETS.filter((t) => t.safety === "safe" || t.safety === "review");
const SOURCES_OK = /^https:\/\/(support\.apple\.com\/en-us\/(102624|102154|108809|121115)|developer\.apple\.com\/videos\/play\/wwdc202[34]\/10(053|123)\/|huggingface\.co\/docs\/huggingface_hub\/main\/en\/guides\/manage-cache|docs\.ollama\.com\/faq|docs\.docker\.com\/desktop\/troubleshoot-and-support\/faqs\/macfaqs\/|developer\.android\.com\/(studio\/run\/managing-avds|tools\/avdmanager)|lmstudio\.ai\/docs\/app\/advanced\/import-model|github\.com\/MiguelBizzi\/bizzi-mac-cleaner\/blob\/main\/docs\/system-data\/README\.md#verification-log)$/;

describe("catalog lint", () => {
  it("has unique, well-formed ids", () => {
    const ids = TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });
  it("gives every safe/review target a relative, non-subtree pattern", () => {
    for (const t of deletable) {
      expect(t.patterns.length).toBeGreaterThan(0);
      for (const p of t.patterns) {
        expect(p.startsWith("/")).toBe(false);
        expect(p.endsWith("**")).toBe(false);
      }
    }
  });
  it("keeps every deletable sample path out of the never list", () => {
    for (const t of deletable)
      for (const p of t.patterns)
        expect(findNeverTarget(samplePath(p), "/home/" + samplePath(p).join("/")), `${t.id}: ${p}`).toBeUndefined();
  });
  it("refuses never paths even where a deletable pattern would match", () => {
    expect(findDeletableTarget(["Library", "Caches", "com.apple.bird"])).toBeDefined();
    expect(findNeverTarget(["Library", "Caches", "com.apple.bird"], "/h/Library/Caches/com.apple.bird")?.id).toBe(
      "never.identity_sync",
    );
  });
  it("documents every cleanup scanner", () => {
    const owned = new Set(TARGETS.map((t) => t.ownedBy).filter(Boolean));
    for (const id of [
      "npm_cache", "yarn_cache", "pnpm_cache", "brew_cache", "xcode_derived_data", "xcode_archives",
      "simulator_caches", "docker_unused", "cocoapods_cache", "gradle_cache", "pip_cache", "cargo_cache",
    ])
      expect(owned.has(id), id).toBe(true);
  });
  it("has every required i18n key in en and pt, and at least one source", () => {
    for (const t of TARGETS) {
      const fields =
        t.safety === "never" ? ["label", "why"] : t.safety === "advisory" ? ["label", "why", "impact"] : ["label", "why", "regen", "impact"];
      for (const loc of LOCALES) for (const f of fields) expect(loc[`sd.${t.id}.${f}`], `${t.id}.${f}`).toBeTruthy();
      expect(t.sources.length).toBeGreaterThan(0);
    }
    for (const loc of LOCALES) {
      for (const g of ["user_caches", "logs", "web_data", "developer", "ai_models", "device_backups", "snapshots", "virtualization", "mail_messages", "system_managed"])
        expect(loc[`sd.group.${g}`], g).toBeTruthy();
      for (const s of ["safe", "review", "advisory", "never"]) {
        expect(loc[`sd.safety.${s}`], s).toBeTruthy();
        expect(loc[`sd.safety.${s}.def`], s).toBeTruthy();
      }
    }
  });
  it("only cites sources listed in the expert guide", () => {
    for (const t of TARGETS) for (const s of t.sources) expect(s, t.id).toMatch(SOURCES_OK);
  });
  it("only uses commands on advisories", () => {
    for (const t of TARGETS) if (t.commands) expect(t.safety).toBe("advisory");
  });
  it("has no '.' or '..' segment in any pattern", () => {
    for (const t of TARGETS)
      for (const p of t.patterns) for (const seg of p.split("/")) expect([".", ".."], `${t.id}: ${p}`).not.toContain(seg);
  });
  it("allows '**' only as the final segment and never as the whole pattern", () => {
    for (const t of TARGETS)
      for (const p of t.patterns) {
        const segs = p.split("/").filter((s) => s !== "");
        expect(p, t.id).not.toBe("**");
        segs.slice(0, -1).forEach((s) => expect(s, `${t.id}: ${p}`).not.toBe("**"));
      }
  });
  it("keeps absolute patterns to never/advisory targets", () => {
    for (const t of TARGETS)
      if (t.patterns.some((p) => p.startsWith("/"))) expect(["never", "advisory"], t.id).toContain(t.safety);
  });
  it("gives every never target at least one pattern", () => {
    for (const t of TARGETS.filter((t) => t.safety === "never")) expect(t.patterns.length, t.id).toBeGreaterThan(0);
  });
  it("mirrors the existing delete policy for ownedBy targets", () => {
    for (const t of TARGETS.filter((t) => t.ownedBy))
      for (const p of t.patterns) {
        const rel = samplePath(p);
        expect(categoryViolation(t.ownedBy as string, "/h/" + rel.join("/"), "/h"), `${t.id}: ${p}`).toBeNull();
      }
  });
  it("respects excludes in findDeletableTarget", () => {
    expect(findDeletableTarget(["Library", "Caches", "Homebrew"])).toBeUndefined();
    expect(findDeletableTarget(["Library", "Caches", "com.foo.app"])?.id).toBe("caches.app");
    expect(findDeletableTarget(["Library", "Caches", "com.apple.Safari"])?.id).toBe("caches.apple");
    expect(findDeletableTarget(["Library", "Developer", "Xcode", "DerivedData"])).toBeUndefined(); // ownedBy
  });
  it("looks targets up by id", () => {
    expect(targetById("caches.app")?.safety).toBe("safe");
    expect(targetById("nope")).toBeUndefined();
  });
});
