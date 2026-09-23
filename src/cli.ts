#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import { loadConfig, scanRootFrom } from "./core/config.js";
import { isDryRun, setDryRun } from "./core/deleteSafely.js";
import { initI18nFromConfig } from "./core/i18n.js";
import { isSafeScanRoot } from "./core/paths.js";
import { assertMacOS } from "./core/platform.js";

const program = new Command();

program
  .name("bizzi-mac-cleaner")
  .description("Reclaim disk space from developer caches and large files (macOS).")
  .option("--root <path>", "Scan root (default: $HOME or settings scanRoot)")
  .option("--dry-run", "Log would-be deletes without sending anything to Trash")
  .option(
    "--no-dry-run",
    "Force live mode for this process (overrides BIZZI_DRY_RUN). Deletes still need TUI confirmation.",
  )
  .action(async (opts: { root?: string; dryRun?: boolean }) => {
    assertMacOS();
    initI18nFromConfig();
    const config = loadConfig();
    const root = scanRootFrom(opts.root, config);
    if (!isSafeScanRoot(root)) {
      console.error(
        `Refusing to scan ${root}. Use your home directory, a project folder, or a fixture — not a system path.`,
      );
      process.exit(1);
    }

    if (opts.dryRun === true) setDryRun(true);
    else if (opts.dryRun === false) setDryRun(false);

    const { waitUntilExit } = render(React.createElement(App, { root, dryRun: isDryRun() }));
    await waitUntilExit();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
