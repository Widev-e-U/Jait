import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

// Running vitest from inside apps/web resolves only the CWD config — for a
// while that was this app's vite.config.ts, whose missing `test` section
// broke every test that relies on globals (bare describe/it/expect) and the
// @emoji-mart/data JSON transitive import. Forward to the shared repo config
// so tests behave identically here: `root` must point at the repo top or the
// root config's `packages/*/src/...` include globs match nothing.
export default mergeConfig(
  rootConfig,
  defineConfig({
    root: fileURLToPath(new URL("../..", import.meta.url)),
  }),
);