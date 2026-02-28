import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns defaults when no env vars are set", () => {
    delete process.env["PORT"];
    delete process.env["WS_PORT"];
    delete process.env["HOST"];
    delete process.env["LOG_LEVEL"];
    delete process.env["CORS_ORIGIN"];
    delete process.env["NODE_ENV"];
    delete process.env["JWT_SECRET"];
    delete process.env["OLLAMA_URL"];
    delete process.env["OLLAMA_MODEL"];

    const config = loadConfig();
    expect(config.port).toBe(8000);
    expect(config.wsPort).toBe(18789);
    expect(config.host).toBe("0.0.0.0");
    expect(config.logLevel).toBe("info");
    expect(config.corsOrigin).toBe("http://localhost:3000");
    expect(config.nodeEnv).toBe("development");
    expect(config.jwtSecret).toBe("jait-dev-secret-change-in-production");
    expect(config.ollamaUrl).toContain("11434");
    expect(config.ollamaModel).toBeTruthy();
  });

  it("reads PORT and WS_PORT from env", () => {
    process.env["PORT"] = "9000";
    process.env["WS_PORT"] = "9001";

    const config = loadConfig();
    expect(config.port).toBe(9000);
    expect(config.wsPort).toBe(9001);
  });

  it("reads all string env vars", () => {
    process.env["HOST"] = "127.0.0.1";
    process.env["LOG_LEVEL"] = "debug";
    process.env["CORS_ORIGIN"] = "http://example.com";
    process.env["NODE_ENV"] = "production";
    process.env["JWT_SECRET"] = "super-secret";
    process.env["OLLAMA_URL"] = "http://myserver:11434";
    process.env["OLLAMA_MODEL"] = "llama3";

    const config = loadConfig();
    expect(config.host).toBe("127.0.0.1");
    expect(config.logLevel).toBe("debug");
    expect(config.corsOrigin).toBe("http://example.com");
    expect(config.nodeEnv).toBe("production");
    expect(config.jwtSecret).toBe("super-secret");
    expect(config.ollamaUrl).toBe("http://myserver:11434");
    expect(config.ollamaModel).toBe("llama3");
  });

  it("handles non-numeric PORT gracefully (NaN)", () => {
    process.env["PORT"] = "not-a-number";
    const config = loadConfig();
    expect(Number.isNaN(config.port)).toBe(true);
  });
});
