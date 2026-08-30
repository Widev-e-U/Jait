import { describe, it, expect, afterEach } from "vitest";
import {
  resolveCommandTimeoutMs,
  defaultCommandTimeoutMs,
  maxCommandTimeoutMs,
  DEFAULT_COMMAND_TIMEOUT_MS,
  MAX_COMMAND_TIMEOUT_MS,
} from "./command-timeout.js";

describe("resolveCommandTimeoutMs", () => {
  afterEach(() => {
    delete process.env.JAIT_TERMINAL_TIMEOUT_MS;
    delete process.env.JAIT_TERMINAL_TIMEOUT_MAX_MS;
  });

  it("falls back to the 1-hour default for omitted/0/negative/NaN", () => {
    expect(resolveCommandTimeoutMs(undefined)).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(resolveCommandTimeoutMs(0)).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(resolveCommandTimeoutMs(-5000)).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(resolveCommandTimeoutMs(Number.NaN)).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(resolveCommandTimeoutMs("not-a-number")).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
  });

  it("honours a raised timeout within the cap (agent may lift the default)", () => {
    expect(resolveCommandTimeoutMs(2 * 60 * 60 * 1000)).toBe(2 * 60 * 60 * 1000);
    expect(resolveCommandTimeoutMs(500)).toBe(500);
    expect(resolveCommandTimeoutMs(42.7)).toBe(43); // ceil
  });

  it("clamps values above the 24-hour cap", () => {
    const cap = MAX_COMMAND_TIMEOUT_MS;
    expect(resolveCommandTimeoutMs(cap + 1)).toBe(cap);
    expect(resolveCommandTimeoutMs(Number.MAX_SAFE_INTEGER)).toBe(cap);
  });

  it("never returns a non-finite or non-positive timeout", () => {
    for (const input of [0, -1, -Infinity, Infinity, Number.NaN, "", "0", null]) {
      const ms = resolveCommandTimeoutMs(input);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
  });

  it("honours env overrides and keeps max >= default", () => {
    process.env.JAIT_TERMINAL_TIMEOUT_MS = "120000";
    expect(defaultCommandTimeoutMs()).toBe(120_000);
    expect(resolveCommandTimeoutMs(undefined)).toBe(120_000);

    process.env.JAIT_TERMINAL_TIMEOUT_MAX_MS = "60000"; // below default on purpose
    expect(maxCommandTimeoutMs()).toBe(120_000); // lifted to the default
    expect(resolveCommandTimeoutMs(5 * 60 * 60 * 1000)).toBe(120_000);
  });

  it("ignores invalid env values", () => {
    process.env.JAIT_TERMINAL_TIMEOUT_MS = "-1";
    process.env.JAIT_TERMINAL_TIMEOUT_MAX_MS = "zero";
    expect(defaultCommandTimeoutMs()).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(maxCommandTimeoutMs()).toBe(MAX_COMMAND_TIMEOUT_MS);
  });
});