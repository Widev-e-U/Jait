import * as nodeModule from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

// Load before dist/index.js so Node can cache its unbundled ESM graph.
// An explicit cache location still wins for deployments that manage it.
const cacheDir = process.env.NODE_COMPILE_CACHE
  || join(process.env.JAIT_STATE_DIR?.trim() || join(homedir(), ".jait"), "cache", "node-compile");
process.env.NODE_COMPILE_CACHE = cacheDir;
nodeModule.enableCompileCache?.(cacheDir);
