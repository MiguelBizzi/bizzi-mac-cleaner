import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts", "src/scanners/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/screens/**", "src/app.tsx", "src/cli.ts"],
    },
  },
});
