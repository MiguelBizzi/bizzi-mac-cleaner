import React, { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import type { CleanupItem } from "../scanners/types.js";
import { getSystemDataContext, type SystemDataContext } from "../systemData/context.js";
import { headerLines, summarizeSystemData } from "../systemData/explain.js";

export function SystemDataHeader({ root, items }: { root: string; items: CleanupItem[] }): React.ReactElement {
  const [ctx, setCtx] = useState<SystemDataContext | null>(null);
  useEffect(() => {
    let live = true;
    void getSystemDataContext(root).then((c) => live && setCtx(c));
    return () => {
      live = false;
    };
  }, [root]);
  const lines = useMemo(() => headerLines(ctx, summarizeSystemData(items)), [ctx, items]);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Text key={i} dimColor={i > 0 && i < lines.length - 1}>
          {l}
        </Text>
      ))}
    </Box>
  );
}
