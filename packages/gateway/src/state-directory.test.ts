import { afterEach, describe, expect, it, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { getStateDirectory } from "./state-directory.js";
import { resolveDatabasePath } from "./db/connection.js";

describe("gateway state isolation", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("preserves the existing server location by default", () => {
    vi.stubEnv("JAIT_STATE_DIR", "");
    expect(getStateDirectory()).toBe(join(homedir(), ".jait"));
  });
  it("rejects relative directories instead of changing state with cwd", () => {
    vi.stubEnv("JAIT_STATE_DIR", "relative");
    expect(() => getStateDirectory()).toThrow("absolute");
  });
  it("uses the desktop state directory for the default database", () => {
    const directory = join(homedir(), "desktop-test-state");
    vi.stubEnv("JAIT_STATE_DIR", directory);
    expect(getStateDirectory()).toBe(directory);
    expect(resolveDatabasePath(undefined, { NODE_ENV: "production" })).toBe(join(directory, "data", "jait.db"));
  });
});
