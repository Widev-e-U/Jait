import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "bun:sqlite": fileURLToPath(new URL("./test-shims/bun-sqlite.ts", import.meta.url)),
      "drizzle-orm/bun-sqlite": "drizzle-orm/better-sqlite3",
      "@jait/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
      "@jait/api-client": fileURLToPath(new URL("./packages/api-client/src/index.ts", import.meta.url)),
      "@jait/screen-share": fileURLToPath(new URL("./packages/screen-share/src/index.ts", import.meta.url)),
      "@jait/ui-shared": fileURLToPath(new URL("./packages/ui-shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/index.ts"],
    },
  },
});
