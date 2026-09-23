import React from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { t } from "../core/i18n.js";
import { useAppContext } from "../app.js";

interface Item {
  label: string;
  value: "scan" | "nodeModules" | "largest" | "emptyTrash" | "settings" | "quit";
}

export function MainMenu({ onQuit }: { onQuit: () => void }): React.ReactElement {
  const { navigate } = useAppContext();
  const items: Item[] = [
    { label: t("menu.scanCaches"), value: "scan" },
    { label: t("menu.nodeModules"), value: "nodeModules" },
    { label: t("menu.largestFiles"), value: "largest" },
    { label: t("menu.emptyTrash"), value: "emptyTrash" },
    { label: t("menu.settings"), value: "settings" },
    { label: t("menu.quit"), value: "quit" },
  ];

  useInput((input) => {
    if (input === "q") onQuit();
  });

  return (
    <Box flexDirection="column">
      <SelectInput
        items={items}
        onSelect={(item: Item) => {
          if (item.value === "quit") onQuit();
          else navigate(item.value);
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>{t("menu.hint")}</Text>
      </Box>
    </Box>
  );
}
