import path from "node:path";
import { categoryViolation } from "../core/deletePolicy.js";
import { dirSize } from "../core/dirSize.js";
import { fsp } from "../core/fs.js";
import { t } from "../core/i18n.js";
import { itemId } from "../core/paths.js";
import type { CleanupItem, ScanOptions } from "../scanners/types.js";
import { TARGETS } from "./catalog.js";
import type { SystemDataContext } from "./context.js";
import { advisoryItem, measure, needsFda } from "./gating.js";
import { inRange } from "./macos.js";
import { allocatedBytes, darwinUserDirs, localSnapshots, simulatorRuntimes } from "./probes.js";
import type { SystemDataTarget } from "./types.js";

/**
 * Advisory items inform; they are never selectable or deletable (the selection
 * layer ignores `advisory`). Each carries a path the delete policy refuses.
 */

const target = (id: string): SystemDataTarget => {
  const found = TARGETS.find((x) => x.id === id);
  if (!found) throw new Error(`unknown system data target ${id}`);
  return found;
};

const isoDay = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Stable synthetic path under the root: not a catalog target, never exists. */
function syntheticPath(root: string, ...parts: string[]): string {
  const safe = parts.map((s) => {
    const clean = s.replace(/[^A-Za-z0-9._-]/g, "_");
    return /^\.*$/.test(clean) ? "_" : clean;
  });
  return path.join(root, ".bizzi-advisory", ...safe);
}

/** The real path when the delete policy refuses it, otherwise the synthetic one. */
function guardedPath(real: string | undefined, root: string, ...synth: string[]): string {
  if (real !== undefined && categoryViolation("system_data", real, root) !== null) return real;
  return syntheticPath(root, ...synth);
}

function base(
  targetId: string,
  key: string,
  itemPath: string,
  description: string,
): Pick<CleanupItem, "id" | "category" | "path" | "lastModified" | "description" | "risk" | "targetId" | "advisory"> {
  return {
    id: itemId("system_data", `advisory:${key}`),
    category: "system_data",
    path: itemPath,
    lastModified: new Date(0),
    description,
    risk: "caution",
    targetId,
    advisory: true,
  };
}

export async function* scanAdvisories(options: ScanOptions, ctx: SystemDataContext): AsyncGenerator<CleanupItem> {
  const { root, signal } = options;
  const live = (id: string): boolean => !signal?.aborted && inRange(ctx.macos, target(id).macos);

  // Docker.raw is a sparse file: report the allocated size, not the apparent one.
  if (live("vm.docker_raw")) {
    const tg = target("vm.docker_raw");
    const real = path.join(root, tg.patterns[0]!);
    try {
      const st = await fsp.lstat(real);
      yield {
        ...base(tg.id, tg.id, guardedPath(real, root, tg.id), t(`sd.${tg.id}.label`)),
        lastModified: st.mtime,
        sizeBytes: allocatedBytes(st),
      };
    } catch {
      /* not installed */
    }
  }

  for (const id of ["vm.colima", "ai.ollama", "dev.go_modcache", "messages.attachments"]) {
    if (!live(id)) continue;
    const tg = target(id);
    const real = path.join(root, tg.patterns[0]!);
    if (needsFda(tg, ctx) && ctx.fda !== "granted") {
      // Task 7 only reports FDA gaps for deletable targets, so advisories report their own.
      yield advisoryItem(tg, root);
      continue;
    }
    const size = await measure(real, signal);
    if (size === "denied") {
      yield advisoryItem(tg, root);
      continue;
    }
    if (!size || size.bytes <= 0) continue;
    yield {
      ...base(tg.id, tg.id, guardedPath(real, root, tg.id), t(`sd.${tg.id}.label`)),
      lastModified: size.mtime,
      sizeBytes: size.bytes,
    };
  }

  if (live("ai.apple_intelligence")) {
    const id = "ai.apple_intelligence";
    yield {
      ...base(id, id, syntheticPath(root, id), t(`sd.${id}.label`)),
      sizeBytes: 0,
      sizeUnknown: true,
    };
  }

  if (!ctx.shell) return;

  if (live("snapshots.tm_local")) {
    const snaps = await localSnapshots();
    if (snaps && snaps.length > 0) {
      const id = "snapshots.tm_local";
      const oldest = snaps.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
      yield {
        ...base(id, id, syntheticPath(root, id), t(`sd.${id}.label`)),
        lastModified: oldest,
        sizeBytes: 0,
        sizeUnknown: true,
        note: t("sd.snapshots.count", { count: snaps.length, oldest: isoDay(oldest) }),
      };
    }
  }

  if (live("dev.simulator_runtimes")) {
    const runtimes = await simulatorRuntimes();
    const id = "dev.simulator_runtimes";
    let n = 0;
    for (const rt of runtimes ?? []) {
      if (signal?.aborted) return;
      n += 1;
      const known = typeof rt.sizeBytes === "number";
      yield {
        ...base(
          id,
          `${id}:${rt.identifier}`,
          syntheticPath(root, id, rt.identifier || String(n)),
          rt.version ? `iOS ${rt.version}` : t(`sd.${id}.label`),
        ),
        lastModified: rt.lastUsedAt ?? new Date(0),
        sizeBytes: known ? rt.sizeBytes! : 0,
        ...(known ? {} : { sizeUnknown: true }),
        ...(rt.lastUsedAt ? { note: t("sd.runtime.lastUsed", { date: isoDay(rt.lastUsedAt) }) } : {}),
      };
    }
  }

  if (live("sys.var_folders")) {
    const id = "sys.var_folders";
    const dirs = await darwinUserDirs();
    if (dirs.length > 0) {
      let bytes = 0;
      for (const dir of dirs) {
        try {
          bytes += await dirSize(dir, signal);
        } catch {
          /* unreadable: counts as zero */
        }
      }
      yield {
        ...base(id, id, guardedPath(dirs[0], root, id), t(`sd.${id}.label`)),
        sizeBytes: bytes,
      };
    }
  }
}
