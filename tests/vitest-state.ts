import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";

// Server fixtures restore persisted services on startup. Never let unit tests
// discover the developer's saved Messenger sessions or other gateway state.
const artifacts = fileURLToPath(new URL("../.jait/artifacts/vitest-state/", import.meta.url));
mkdirSync(artifacts, { recursive: true });

// Node derives its compile cache from TMPDIR and flushes it lazily, often after
// this file's teardown has already run. Keep that cache in a stable directory
// outside the per-suite tree so the recursive unlink below cannot race a late
// write (the race surfaced as ENOTEMPTY on tmp/node-compile-cache).
const compileCache = join(artifacts, "node-compile-cache");
mkdirSync(compileCache, { recursive: true });
if (!process.env["NODE_COMPILE_CACHE"]) process.env["NODE_COMPILE_CACHE"] = compileCache;

const stateDirectory = mkdtempSync(join(artifacts, "suite-"));
process.env["JAIT_STATE_DIR"] = stateDirectory;
const temporaryDirectory = join(stateDirectory, "tmp");
mkdirSync(temporaryDirectory);
for (const key of ["TMPDIR", "TEMP", "TMP"]) process.env[key] = temporaryDirectory;

// Keep the override after cleanup so late callbacks cannot fall back to ~/.jait.
// This cleanup is best-effort: helpers may still be flushing into TMPDIR when the
// last test file finishes, so a transient ENOTEMPTY/EBUSY/EPERM must not fail
// whichever test file happened to exit last. Directories are unique per run, so
// leaving one behind is harmless and never leaks into the next suite.
afterAll(() => {
  try {
    rmSync(stateDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EPERM") throw error;
  }
});
