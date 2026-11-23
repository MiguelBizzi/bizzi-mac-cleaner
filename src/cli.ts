#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { currentPackageVersion } from "./core/updateCheck.js";
import { App } from "./app.js";
import { loadConfig, scanRootFrom, updateConfig } from "./core/config.js";
import { drainDeletes, hasInFlightDeletes, requestStopDeleting } from "./core/deleteItems.js";
import { isDryRun, setDryRun } from "./core/deleteSafely.js";
import { initI18nFromConfig } from "./core/i18n.js";
import { isSafeScanRoot } from "./core/paths.js";
import { assertMacOS } from "./core/platform.js";

const program = new Command();

program
  .name("bizzi-mac-cleaner")
  .version(currentPackageVersion(), "-v, --version", "Print the version")
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

    // Preview-first: until the user opts in to live mode once (--no-dry-run),
    // nothing is ever sent to Trash. An explicit BIZZI_DRY_RUN value is respected.
    if (opts.dryRun === true) {
      setDryRun(true);
    } else if (opts.dryRun === false) {
      setDryRun(false);
      if (!config.liveEnabled) updateConfig({ liveEnabled: true });
    } else if (!config.liveEnabled && process.env.BIZZI_DRY_RUN === undefined) {
      setDryRun(true);
    }

    const instance = render(React.createElement(App, { root, dryRun: isDryRun() }));
    const onSignal = () => {
      requestStopDeleting();
      instance.unmount();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    await instance.waitUntilExit();

    // Ctrl+C mid-delete: finish the item being trashed, skip the rest, then exit cleanly.
    requestStopDeleting();
    if (hasInFlightDeletes()) {
      console.error("Stopping after the current item… anything already moved can be restored from the Trash.");
      await drainDeletes();
      console.error("Stopped. Remaining items were not touched.");
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
