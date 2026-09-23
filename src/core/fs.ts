import { promises as fsp } from "node:fs";
import fs from "node:fs";

/**
 * Re-exported so tests can mock a single module (`node:fs` / `node:fs/promises`)
 * via memfs without every scanner importing Node builtins directly.
 */
export { fsp, fs };
