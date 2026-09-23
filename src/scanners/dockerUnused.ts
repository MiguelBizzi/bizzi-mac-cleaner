import path from "node:path";
import { dockerSystemDf } from "../core/shell/docker.js";
import { allowShellDiscovery, yieldEachExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

/**
 * Docker Desktop caches under ~/Library — never the VM disk image.
 * `docker system prune` is a permanent delete, so this scanner only offers
 * trashable cache folders (risk: caution).
 */
export const dockerUnusedScanner: Scanner = {
  id: "docker_unused",
  labelKey: "scanners.dockerUnused",
  async *scan(options) {
    if (allowShellDiscovery(options.root)) {
      await dockerSystemDf();
    }
    yield* yieldEachExistingDir(options, {
      category: "docker_unused",
      candidates: [
        path.join(options.root, "Library", "Caches", "com.docker.docker"),
        path.join(options.root, "Library", "Caches", "Docker Desktop"),
        path.join(options.root, "Library", "Containers", "com.docker.docker", "Data", "log"),
      ],
      risk: "caution",
      describe: (p) => path.basename(p),
    });
  },
};
