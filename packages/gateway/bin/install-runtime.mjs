#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const runtimeModule = resolve(binDir, "../dist/services/code-graph/graphify-runtime.js");
const sourceTree = resolve(binDir, "../src");

if (!existsSync(runtimeModule)) {
  if (existsSync(sourceTree)) {
    console.log("[jait] Graphify provisioning deferred until the gateway is built.");
    process.exit(0);
  }
  console.error("[jait] Packaged Graphify runtime manager is missing.");
  process.exit(1);
}

try {
  const { ensureGraphifyRuntime } = await import(runtimeModule);
  await ensureGraphifyRuntime({
    onProgress: (message) => console.log(`[jait] ${message}`),
  });
} catch (error) {
  console.error(`[jait] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
