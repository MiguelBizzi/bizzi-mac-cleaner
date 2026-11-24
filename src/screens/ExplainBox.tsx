import React from "react";
import { Box, Text } from "ink";
import { t } from "../core/i18n.js";
import type { Explanation } from "../systemData/explain.js";

export function ExplainBox({ info }: { info: Explanation }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold>
        {info.title} <Text dimColor>· {info.group}</Text>
      </Text>
      <Text>
        {t("sd.explain.safety")}: {info.safety} <Text dimColor>— {info.safetyDef}</Text>
      </Text>
      <Text>
        {t("sd.explain.why")}: {info.why}
      </Text>
      {info.regen ? (
        <Text>
          {t("sd.explain.regen")}: {info.regen}
        </Text>
      ) : null}
      {info.impact ? (
        <Text>
          {t("sd.explain.impact")}: {info.impact}
        </Text>
      ) : null}
      <Text dimColor>
        {t("sd.explain.path")}: {info.path}
      </Text>
      {info.commands ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">{t("sd.explain.commands")}</Text>
          {info.commands.map((c) => (
            <Text key={c} dimColor>
              {"  $ "}
              {c}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
