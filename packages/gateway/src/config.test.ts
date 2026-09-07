import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { inferContextWindow, loadConfig } from "./config.js";

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
    expect(config.jwtSecret).toHaveLength(64);
    expect(config.hookSecret).toHaveLength(64);
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

  it("defaults the Windows VM SSH credentials to the dockur image defaults", () => {
    delete process.env["WINDOWS_SSH_USERNAME"];
    delete process.env["WINDOWS_SSH_PASSWORD"];
    const config = loadConfig();
    expect(config.windowsSshUsername).toBe("Docker");
    expect(config.windowsSshPassword).toBe("admin");
  });

  it("reads WINDOWS_SSH_USERNAME / WINDOWS_SSH_PASSWORD from env", () => {
    process.env["WINDOWS_SSH_USERNAME"] = "jait";
    process.env["WINDOWS_SSH_PASSWORD"] = "s3cret";
    const config = loadConfig();
    expect(config.windowsSshUsername).toBe("jait");
    expect(config.windowsSshPassword).toBe("s3cret");
  });
});

describe("inferContextWindow", () => {
  it("keeps OmniRoute routing aliases at the conservative default", () => {
    expect(inferContextWindow("auto")).toBe(128_000);
    expect(inferContextWindow("auto/coding")).toBe(128_000);
  });

  it("maps OpenAI model families", () => {
    expect(inferContextWindow("gpt-5")).toBe(400_000);
    expect(inferContextWindow("gpt-4o")).toBe(128_000);
    expect(inferContextWindow("gpt-4.1-mini")).toBe(128_000);
    expect(inferContextWindow("gpt-4-turbo")).toBe(128_000);
    expect(inferContextWindow("gpt-4")).toBe(8_192);
    expect(inferContextWindow("gpt-3.5-turbo")).toBe(16_385);
  });

  it("maps Anthropic model families", () => {
    expect(inferContextWindow("claude-3-5-sonnet")).toBe(200_000);
    expect(inferContextWindow("claude-4-sonnet")).toBe(200_000);
    expect(inferContextWindow("claude-sonnet")).toBe(100_000);
  });

  it("maps the remaining families and falls back to a safe default", () => {
    expect(inferContextWindow("gemini-2.0-flash")).toBe(128_000);
    expect(inferContextWindow("o1-preview")).toBe(200_000);
    expect(inferContextWindow("o3-mini")).toBe(200_000);
    expect(inferContextWindow("o4-mini")).toBe(200_000);
    expect(inferContextWindow("deepseek-chat")).toBe(64_000);
    expect(inferContextWindow("mistral-large")).toBe(32_000);
    expect(inferContextWindow("mixtral-8x7b")).toBe(32_000);
    expect(inferContextWindow("llama3.1")).toBe(8_192);
    expect(inferContextWindow("some-unknown-model")).toBe(128_000);
  });

  it("is case-insensitive", () => {
    expect(inferContextWindow("GPT-4O")).toBe(128_000);
    expect(inferContextWindow("Claude-3-5-Sonnet")).toBe(200_000);
  });
});
