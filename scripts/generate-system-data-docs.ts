#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderTaxonomyMarkdown } from "../src/systemData/docs.js";

const out = path.join("docs", "system-data", "TAXONOMY.md");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, renderTaxonomyMarkdown(), "utf8");
console.log(`Wrote ${out}`);
