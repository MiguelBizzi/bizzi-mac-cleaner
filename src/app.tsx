import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { loadConfig, updateConfig, type AppConfig } from "./core/config.js";
import { isDryRun } from "./core/deleteSafely.js";
import { t, setLocale } from "./core/i18n.js";
import { clearScreen } from "./core/terminal.js";
import { MainMenu } from "./screens/MainMenu.js";
import { ScanScreen } from "./screens/ScanScreen.js";
import { NodeModulesScreen } from "./screens/NodeModulesScreen.js";
import { LargestFilesScreen } from "./screens/LargestFilesScreen.js";
import { EmptyTrashScreen } from "./screens/EmptyTrashScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";

export type ScreenName = "menu" | "scan" | "nodeModules" | "largest" | "emptyTrash" | "settings";

export interface AppContextValue {
  root: string;
  dryRun: boolean;
  config: AppConfig;
  patchConfig: (patch: Partial<AppConfig>) => void;
  navigate: (screen: ScreenName) => void;
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

  const root = initialRoot;
  const value = useMemo<AppContextValue>(
    () => ({ root, dryRun, config, patchConfig, navigate }),
    [root, dryRun, config, patchConfig, navigate],
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
        <Box marginTop={1} flexDirection="column" flexGrow={1}>
          {screen === "menu" ? <MainMenu onQuit={() => exit()} /> : null}
          {screen === "scan" ? <ScanScreen /> : null}
          {screen === "nodeModules" ? <NodeModulesScreen /> : null}
          {screen === "largest" ? <LargestFilesScreen /> : null}
          {screen === "emptyTrash" ? <EmptyTrashScreen /> : null}
          {screen === "settings" ? <SettingsScreen /> : null}
        </Box>
      </Box>
    </AppContext.Provider>
  );
}
