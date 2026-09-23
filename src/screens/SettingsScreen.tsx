import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useAppContext } from "../app.js";
import { availableLocales, t } from "../core/i18n.js";
import { moveCursor } from "../core/scanView.js";

type Field = "language" | "staleDays" | "scanRoot" | "confirmEvery" | "largestN";

const FIELDS: Field[] = ["language", "staleDays", "scanRoot", "confirmEvery", "largestN"];

export function SettingsScreen(): React.ReactElement {
  const { config, patchConfig, navigate } = useAppContext();
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const field = FIELDS[cursor] ?? "language";

  useInput((_input, key) => {
    if (editing) {
      if (key.escape) setEditing(false);
      return;
    }
    if (key.escape) {
      navigate("menu");
      return;
    }
    if (key.upArrow) {
      setCursor((c) => moveCursor(c, -1, FIELDS.length));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => moveCursor(c, 1, FIELDS.length));
      return;
    }
    if (key.return) {
      if (field === "language") {
        const locales = availableLocales();
        const idx = locales.indexOf(config.locale);
        const next = locales[(idx + 1) % locales.length] ?? "en";
        patchConfig({ locale: next });
        return;
      }
      if (field === "confirmEvery") {
        patchConfig({ confirmEveryDelete: !config.confirmEveryDelete });
        return;
      }
      if (field === "staleDays") {
        setDraft(String(config.staleDays));
        setEditing(true);
        return;
      }
      if (field === "scanRoot") {
        setDraft(config.scanRoot);
        setEditing(true);
        return;
      }
      if (field === "largestN") {
        setDraft(String(config.largestFilesCount));
        setEditing(true);
      }
    }
  });

  const commit = (value: string) => {
    if (field === "staleDays") {
      const n = Number.parseInt(value, 10);
      if (Number.isFinite(n) && n > 0) patchConfig({ staleDays: n });
    } else if (field === "scanRoot" && value.trim()) {
      patchConfig({ scanRoot: value.trim() });
    } else if (field === "largestN") {
      const n = Number.parseInt(value, 10);
      if (Number.isFinite(n) && n > 0) patchConfig({ largestFilesCount: n });
    }
    setEditing(false);
  };

  return (
    <Box flexDirection="column">
      <Row active={cursor === 0} label={t("settings.language")} value={config.locale} />
      <Row
        active={cursor === 1}
        label={t("settings.staleDays")}
        value={editing && field === "staleDays" ? undefined : String(config.staleDays)}
      >
        {editing && field === "staleDays" ? (
          <TextInput value={draft} onChange={setDraft} onSubmit={commit} />
        ) : null}
      </Row>
      <Row
        active={cursor === 2}
        label={t("settings.scanRoot")}
        value={editing && field === "scanRoot" ? undefined : config.scanRoot}
      >
        {editing && field === "scanRoot" ? (
          <TextInput value={draft} onChange={setDraft} onSubmit={commit} />
        ) : null}
      </Row>
      <Row
        active={cursor === 3}
        label={config.confirmEveryDelete ? t("settings.confirmEvery") : t("settings.confirmBatch")}
        value={config.confirmEveryDelete ? "on" : "off"}
      />
      <Row
        active={cursor === 4}
        label={t("settings.largestN")}
        value={editing && field === "largestN" ? undefined : String(config.largestFilesCount)}
      >
        {editing && field === "largestN" ? (
          <TextInput value={draft} onChange={setDraft} onSubmit={commit} />
        ) : null}
      </Row>
      <Box marginTop={1}>
        <Text dimColor>{t("settings.hint")}</Text>
      </Box>
    </Box>
  );
}

function Row({
  active,
  label,
  value,
  children,
}: {
  active: boolean;
  label: string;
  value?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Box>
      <Text inverse={active}>
        {label}: {value ?? ""}
      </Text>
      {children}
    </Box>
  );
}
