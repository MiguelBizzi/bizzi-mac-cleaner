import { describe, expect, it } from "vitest";
import { t } from "../core/i18n.js";
import type { CleanupItem } from "../scanners/types.js";
import type { SystemDataContext } from "./context.js";
import { confirmImpacts, explainHeight, explainItem, headerLines, itemRowView, summarizeSystemData } from "./explain.js";

let n = 0;
const item = (p: Partial<CleanupItem> = {}): CleanupItem => ({
  id: `i${n++}`,
  category: "system_data",
  path: "/h/x",
  sizeBytes: 1,
  lastModified: new Date(0),
  risk: "safe",
  ...p,
});
const ctx = (over: Partial<SystemDataContext> = {}): SystemDataContext => ({
  macos: { major: 27, minor: 0, patch: 1 },
  support: "verified",
  fda: "granted",
  apps: { names: new Set(), bundleIds: new Set(), ok: true },
  shell: true,
  ...over,
});

describe("explainItem", () => {
  it("explains a catalog item with its safety definition", () => {
    const e = explainItem(item({ targetId: "dev.device_support", risk: "caution" }))!;
    expect(e.safety).toBe(t("sd.safety.review"));
    expect(e.safetyDef).toBe(t("sd.safety.review.def"));
    expect(e.why).toBe(t("sd.dev.device_support.why"));
    expect(e.regen).toBeTruthy();
    expect(e.path).toBe("/h/x");
  });
  it("shows commands for advisories", () => {
    const e = explainItem(item({ targetId: "snapshots.tm_local", advisory: true }))!;
    expect(e.commands).toContain("tmutil listlocalsnapshots /");
    expect(e.safety).toBe(t("sd.safety.advisory"));
  });
  it("shows the review wording when a safe target was downgraded to caution", () => {
    const e = explainItem(item({ targetId: "caches.app", risk: "caution" }))!;
    expect(e.safety).toBe(t("sd.safety.review"));
    expect(e.safetyDef).toBe(t("sd.safety.review.def"));
    expect(explainItem(item({ targetId: "caches.app", risk: "safe" }))!.safety).toBe(t("sd.safety.safe"));
  });
  it("hides the placeholder path for advisories", () => {
    expect(explainItem(item({ targetId: "snapshots.tm_local", advisory: true }))!.path).toBeUndefined();
  });
  it("returns null without a targetId or for an unknown target", () => {
    expect(explainItem(item())).toBeNull();
    expect(explainItem(item({ targetId: "nope.nope" }))).toBeNull();
  });
});

describe("summarizeSystemData", () => {
  it("summarizes reclaimable vs advisory bytes", () => {
    const s = summarizeSystemData([
      item({ sizeBytes: 10, risk: "safe" }),
      item({ sizeBytes: 5, risk: "caution" }),
      item({ sizeBytes: 100, advisory: true }),
      item({ sizeBytes: 7, advisory: true, sizeUnknown: true, targetId: "x", note: t("sd.needsFda") }),
    ]);
    expect(s).toMatchObject({ reclaimableBytes: 10, reviewBytes: 5, advisoryBytes: 107, advisoryCount: 2 });
  });
  it("counts needs-FDA advisories", () => {
    const fda = item({ advisory: true, sizeUnknown: true, sizeBytes: 0, note: t("sd.needsFda") });
    expect(summarizeSystemData([fda, item({ advisory: true })]).needsFdaCount).toBe(1);
  });
});

describe("confirmImpacts", () => {
  it("lists distinct impacts of caution items only, in first-seen order", () => {
    const a = item({ targetId: "web.webkit", risk: "caution" });
    const safe = item({ targetId: "caches.app", risk: "safe" });
    expect(confirmImpacts([a, safe, { ...a, id: "2" }])).toEqual([t("sd.web.webkit.impact")]);
  });
  it("skips items without catalog impact text", () => {
    expect(confirmImpacts([item({ risk: "caution" })])).toEqual([]);
  });
});

describe("headerLines", () => {
  const sum = summarizeSystemData([item({ sizeBytes: 1024 }), item({ advisory: true, sizeBytes: 2048 })]);
  it("renders a loading state without context", () => {
    expect(headerLines(null, sum).join("\n")).toContain(t("sd.header.loading"));
  });
  it("shows verified macOS, FDA granted and the summary", () => {
    const l = headerLines(ctx(), sum);
    expect(l[0]).toContain("macOS 27.0.1");
    expect(l[0]).toContain(t("sd.header.verified"));
    expect(l[1]).toContain(t("sd.header.fdaGranted"));
    expect(l[2]).toContain("Reclaimable");
    expect(l[2]).toContain("Managed by macOS/tools");
  });
  it("handles unverified, unsupported and unknown macOS without crashing", () => {
    expect(headerLines(ctx({ support: "unverified" }), sum)[0]).toContain(t("sd.header.unverified"));
    expect(headerLines(ctx({ support: "unsupported" }), sum)[0]).toContain(t("sd.header.unsupported"));
    expect(() => headerLines(ctx({ macos: null, support: "unverified", fda: "unknown" }), sum)).not.toThrow();
  });
  it("says how many locations FDA hides", () => {
    const s = summarizeSystemData([
      item({ advisory: true, sizeUnknown: true, sizeBytes: 0, note: t("sd.needsFda") }),
    ]);
    expect(headerLines(ctx({ fda: "denied" }), s)[1]).toContain("(1 ");
  });
});

describe("itemRowView", () => {
  it("dims advisories, uses [i] and shows an em dash for unknown sizes", () => {
    const v = itemRowView(item({ advisory: true, sizeUnknown: true, sizeBytes: 0, targetId: "x" }), false);
    expect(v).toMatchObject({ dim: true, mark: "[i]", size: "—", tag: t("sd.safety.advisory") });
  });
  it("shows [x]/[ ] for selectable rows", () => {
    expect(itemRowView(item(), true).mark).toBe("[x]");
    expect(itemRowView(item(), false)).toMatchObject({ mark: "[ ]", dim: false });
  });
});

describe("explainHeight", () => {
  it("grows with wrapped text and commands, and never returns less than the border", () => {
    const info = explainItem(item({ targetId: "snapshots.tm_local", advisory: true }))!;
    const wide = explainHeight(info, 200);
    const narrow = explainHeight(info, 40);
    expect(narrow).toBeGreaterThan(wide);
    expect(wide).toBeGreaterThanOrEqual(2 + 4 + (info.commands?.length ?? 0));
  });
});
