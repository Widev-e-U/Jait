import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultDbPath, resolveDatabasePath } from "./connection.js";

describe("database path resolution", () => {
  it("prefers an explicit path over environment configuration", () => {
    expect(resolveDatabasePath(":memory:", {
      NODE_ENV: "test",
      JAIT_DB_PATH: "/tmp/ignored.db",
    })).toBe(":memory:");
  });

  it("uses JAIT_DB_PATH when provided", () => {
    expect(resolveDatabasePath(undefined, {
      NODE_ENV: "test",
      JAIT_DB_PATH: "/tmp/jait-test.db",
    })).toBe("/tmp/jait-test.db");
  });

  it("refuses the default user database in test mode", () => {
    expect(() => resolveDatabasePath(undefined, { NODE_ENV: "test" }))
      .toThrow("Refusing to open the default Jait database in test mode");
  });

  it("uses the normal default outside test mode", () => {
    expect(resolveDatabasePath(undefined, { NODE_ENV: "production" }))
      .toBe(defaultDbPath());
  });

  it("wires the E2E gateway to an isolated temporary database", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../../tests/e2e/scripts/start-dev-stack.mjs", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("mkdtemp(resolve(tmpdir(), 'jait-e2e-'))");
    expect(source).toContain("JAIT_DB_PATH: resolve(e2eStateDir, 'jait.db')");
    expect(source).toContain("rm(e2eStateDir, { recursive: true, force: true })");
  });
});
