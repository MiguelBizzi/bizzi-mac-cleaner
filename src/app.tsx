import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { loadConfig, updateConfig, type AppConfig } from "./core/config.js";
import { isDryRun } from "./core/deleteSafely.js";
import { t, setLocale } from "./core/i18n.js";
import { type ScanCacheId, type ScanSnapshot } from "./core/scanCache.js";
import { clearScreen } from "./core/terminal.js";
import { checkForUpdate, type UpdateNotice } from "./core/updateCheck.js";
import { MainMenu } from "./screens/MainMenu.js";
import { ScanScreen } from "./screens/ScanScreen.js";
import { NodeModulesScreen } from "./screens/NodeModulesScreen.js";
import { LargestFilesScreen } from "./screens/LargestFilesScreen.js";
import { EmptyTrashScreen } from "./screens/EmptyTrashScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { SystemDataHeader } from "./screens/SystemDataHeader.js";
import { systemDataScanner } from "./systemData/scanner.js";

const systemDataScanners = [systemDataScanner];

export type ScreenName = "menu" | "scan" | "systemData" | "nodeModules" | "largest" | "emptyTrash" | "settings";

export interface AppContextValue {
  root: string;
  dryRun: boolean;
  config: AppConfig;
  patchConfig: (patch: Partial<AppConfig>) => void;
  navigate: (screen: ScreenName) => void;
  getScanCache: (id: ScanCacheId) => ScanSnapshot | undefined;
  setScanCache: (id: ScanCacheId, snapshot: ScanSnapshot) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext outside App");
  return ctx;
}

export interface AppProps {
  root: string;
  dryRun: boolean;
}

export function App({ root: initialRoot, dryRun }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [screen, setScreen] = useState<ScreenName>("menu");
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const [scanCache, setScanCacheState] = useState<Partial<Record<ScanCacheId, ScanSnapshot>>>({});
  const [updateNotice, setUpdateNotice] = useState<UpdateNotice | null>(null);

  useEffect(() => {
    if (!config.updateCheck || process.env.BIZZI_NO_UPDATE_CHECK === "1") return;
    const controller = new AbortController();
    void checkForUpdate({ signal: controller.signal }).then((notice) => {
      if (!controller.signal.aborted && notice) setUpdateNotice(notice);
    });
    return () => controller.abort();
  }, []);

  const patchConfig = useCallback((patch: Partial<AppConfig>) => {
    const next = updateConfig(patch);
    if (patch.locale) setLocale(patch.locale);
    setConfig(next);
  }, []);

  const navigate = useCallback(
    (next: ScreenName) => {
      clearScreen(stdout);
      setScreen(next);
    },
    [stdout],
  );

  const getScanCache = useCallback((id: ScanCacheId) => scanCache[id], [scanCache]);

  const setScanCache = useCallback((id: ScanCacheId, snapshot: ScanSnapshot) => {
    setScanCacheState((prev) => ({ ...prev, [id]: snapshot }));
  }, []);

  const root = initialRoot;
  const value = useMemo<AppContextValue>(
    () => ({ root, dryRun, config, patchConfig, navigate, getScanCache, setScanCache }),
    [root, dryRun, config, patchConfig, navigate, getScanCache, setScanCache],
  );

  const rows = stdout.rows || 24;

  return (
    <AppContext.Provider value={value}>
      <Box flexDirection="column" height={rows} paddingX={1}>
        <Box>
          <Text bold color="cyan">
            {t("app.title")}
          </Text>
          {isDryRun() || dryRun ? (
            <Text color="yellow">  {t("app.dryRunBanner")}</Text>
          ) : (
            <Text color="red">  {t("app.liveBanner")}</Text>
          )}
        </Box>
        <Text dimColor>{t("app.root", { root })}</Text>
        {(isDryRun() || dryRun) && !config.liveEnabled ? (
          <Text color="yellow">{t("app.previewHint")}</Text>
        ) : null}
        {updateNotice ? (
          <Text color="yellow">
            {t("app.updateAvailable", {
              current: updateNotice.current,
              latest: updateNotice.latest,
            })}
          </Text>
        ) : null}
        <Box marginTop={1} flexDirection="column" flexGrow={1}>
          {screen === "menu" ? <MainMenu onQuit={() => exit()} /> : null}
          {screen === "scan" ? <ScanScreen /> : null}
          {screen === "systemData" ? (
            <ScanScreen
              scanners={systemDataScanners}
              cacheId="systemData"
              header={(items) => <SystemDataHeader root={root} items={items} />}
            />
          ) : null}
          {screen === "nodeModules" ? <NodeModulesScreen /> : null}
          {screen === "largest" ? <LargestFilesScreen /> : null}
          {screen === "emptyTrash" ? <EmptyTrashScreen /> : null}
          {screen === "settings" ? <SettingsScreen /> : null}
        </Box>
      </Box>
    </AppContext.Provider>
  );
}
