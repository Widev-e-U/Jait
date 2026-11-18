import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The root workspace Vitest config only picks up packages/* and apps/* specs.
// This dedicated config runs just the matcher differential corpus. It lives at
// the repository root so the corpus spec can resolve its fixtures by URL.
export default defineConfig({
  root: fileURLToPath(new URL("../../..", import.meta.url)),
  test: {
    globals: true,
    environment: "node",
    include: ["tests/contract/tooling/matcher-differential.test.ts"],
    testTimeout: 30_000,
  },
});
