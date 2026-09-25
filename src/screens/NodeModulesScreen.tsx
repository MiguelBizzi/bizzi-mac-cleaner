import React from "react";
import { nodeModulesScanner } from "../scanners/index.js";
import { ScanScreen } from "./ScanScreen.js";

const SCANNERS = [nodeModulesScanner];

export function NodeModulesScreen(): React.ReactElement {
  return <ScanScreen scanners={SCANNERS} cacheId="nodeModules" />;
}
