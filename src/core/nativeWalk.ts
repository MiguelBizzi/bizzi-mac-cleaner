import { createRequire } from "node:module";
import { arch } from "node:process";
import { fileURLToPath } from "node:url";

export interface AbortFlag {
  abort(): void;
}

export interface NodeModuleHit {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  stale: boolean;
}

export interface LargeFileHit {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface NativeAddon {
  directorySize(path: string, abort?: AbortFlag): Promise<number>;
  scanNodeModules(
    root: string,
    staleDays: number,
    onItem: (err: Error | null, hit: NodeModuleHit) => void,
    abort?: AbortFlag,
  ): Promise<void>;
  scanLargestFiles(
    root: string,
    limit: number,
    onItem: (err: Error | null, hit: LargeFileHit) => void,
    abort?: AbortFlag,
  ): Promise<void>;
  AbortFlag: { create(): AbortFlag };
}

let cached: NativeAddon | null | undefined;

function addonFile(): string {
  const triple = arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  return fileURLToPath(new URL(`../../native/bizzi-walker.${triple}.node`, import.meta.url));
}

/** Native walker, or null when tests, `BIZZI_JS_WALK=1`, or the binary is missing. */
export function loadNative(): NativeAddon | null {
  if (process.env.BIZZI_JS_WALK === "1") return null;
  if (process.env.VITEST && process.env.BIZZI_NATIVE_WALK !== "1") return null;
  if (cached !== undefined) return cached;
  try {
    const require = createRequire(import.meta.url);
    cached = require(addonFile()) as NativeAddon;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Bridge a native scan callback into an async generator. Items are buffered
 * so a callback that arrives before the consumer pulls is not dropped.
 */
export async function* streamNativeScan<T>(
  native: NativeAddon,
  signal: AbortSignal | undefined,
  run: (onItem: (item: T) => void, abort: AbortFlag) => Promise<void>,
): AsyncGenerator<T> {
  const abort = native.AbortFlag.create();
  const onAbort = () => abort.abort();
  if (signal?.aborted) abort.abort();
  signal?.addEventListener("abort", onAbort);

  const pending: T[] = [];
  let waiter: ((value: T | undefined) => void) | null = null;
  let finished = false;
  let failure: unknown;

  const push = (item: T) => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(item);
    } else {
      pending.push(item);
    }
  };
  const finish = (err?: unknown) => {
    failure = err;
    finished = true;
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(undefined);
    }
  };

  const task = run(push, abort).then(
    () => finish(),
    (err: unknown) => finish(err),
  );

  try {
    while (true) {
      const item = pending.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (finished) break;
      const next = await new Promise<T | undefined>((resolve) => {
        waiter = resolve;
      });
      if (next === undefined) break;
      yield next;
    }
    await task;
    if (failure) throw failure;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
