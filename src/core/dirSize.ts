import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { loadNative } from "./nativeWalk.js";
import { walk } from "./fsWalk.js";

const workerLimit = pLimit(2);

export async function sizeInline(dir: string, signal?: AbortSignal): Promise<number> {
  let total = 0;
  try {
    const { fsp } = await import("./fs.js");
    const st = await fsp.lstat(dir);
    if (!st.isDirectory()) return st.size;
  } catch {
    return 0;
  }
  for await (const entry of walk(dir, {
    excludeNames: [".git"],
    followSymlinks: false,
    signal,
  })) {
    if (!entry.isDirectory) total += entry.size;
  }
  return total;
}

function shouldUseWorker(): boolean {
  if (process.env.VITEST) return false;
  if (process.env.BIZZI_INLINE_SIZE === "1") return false;
  return true;
}

function workerFile(): string {
  const isTs = import.meta.url.endsWith(".ts");
  return fileURLToPath(new URL(isTs ? "./sizeWorker.ts" : "./sizeWorker.js", import.meta.url));
}

function sizeViaWorker(dir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile(), {
      workerData: { dir },
      execArgv: process.execArgv,
    });
    worker.once("message", (msg: { ok: boolean; bytes?: number; error?: string }) => {
      if (msg.ok && typeof msg.bytes === "number") resolve(msg.bytes);
      else reject(new Error(msg.error ?? "size worker failed"));
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`size worker exited ${code}`));
    });
  });
}

/**
 * Directory size in bytes. Offloads to a worker_thread in production so the
 * Ink UI stays responsive; tests and BIZZI_INLINE_SIZE=1 stay in-process
 * (memfs cannot cross the worker boundary).
 */
export async function dirSize(dir: string, signal?: AbortSignal): Promise<number> {
  const native = loadNative();
  if (native) {
    const abort = native.AbortFlag.create();
    const onAbort = () => abort.abort();
    if (signal?.aborted) abort.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      return await native.directorySize(dir, abort);
    } catch {
      return sizeInline(dir, signal);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
  if (!shouldUseWorker()) return sizeInline(dir, signal);
  try {
    return await workerLimit(() => sizeViaWorker(dir));
  } catch {
    return sizeInline(dir, signal);
  }
}
