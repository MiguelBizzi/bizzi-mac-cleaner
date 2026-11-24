import { readFileSync } from "node:fs"; // real fs: do not mock in this file
import { describe, expect, it } from "vitest";
import { getLocale, resetI18nForTests, setLocale, t } from "../core/i18n.js";
import { TARGETS } from "./catalog.js";
import { renderTaxonomyMarkdown } from "./docs.js";

describe("generated taxonomy docs", () => {
  it("TAXONOMY.md is in sync with the catalog (run npm run docs:system-data)", () => {
    expect(readFileSync("docs/system-data/TAXONOMY.md", "utf8")).toBe(renderTaxonomyMarkdown());
  });

  it("lists every target label", () => {
    const md = renderTaxonomyMarkdown();
    for (const target of TARGETS) expect(md).toContain(t(`sd.${target.id}.label`));
  });

  it("is locale-independent and restores the current locale", () => {
    const en = renderTaxonomyMarkdown();
    setLocale("pt");
    try {
      expect(renderTaxonomyMarkdown()).toBe(en);
      expect(getLocale()).toBe("pt");
    } finally {
      resetI18nForTests();
    }
  });

  it("renders an unverified macOS bound honestly", () => {
    const flagged = TARGETS.filter((x) => x.macosUnverified);
    expect(flagged.length).toBeGreaterThan(0);
    for (const target of flagged) {
      const line = renderTaxonomyMarkdown().split("\n").find((l) => l.startsWith(`| ${t(`sd.${target.id}.label`)} |`));
      expect(line).toContain(`${target.macos!.min}+ (unverified)`);
    }
  });

  it("escapes table cells", () => {
    const rows = renderTaxonomyMarkdown().split("\n").filter((l) => l.startsWith("| "));
    for (const row of rows) expect(row.replace(/\\\|/g, "").split("|").length).toBe(rows[0]!.replace(/\\\|/g, "").split("|").length);
  });
});

describe("README stays honest about the never list", () => {
  it("mentions every never target label", () => {
    const readme = readFileSync("README.md", "utf8").toLowerCase();
    for (const target of TARGETS.filter((x) => x.safety === "never")) {
      expect(readme).toContain(t(`sd.${target.id}.label`).toLowerCase());
    }
  });
});
