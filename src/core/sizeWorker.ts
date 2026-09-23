import { parentPort, workerData } from "node:worker_threads";
import { sizeInline } from "./dirSize.js";

const dir: string = workerData.dir;
sizeInline(dir)
  .then((bytes) => parentPort?.postMessage({ ok: true, bytes }))
  .catch((err: unknown) =>
    parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
