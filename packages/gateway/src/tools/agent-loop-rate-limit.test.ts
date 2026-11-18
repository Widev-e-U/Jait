import { describe, expect, it } from "vitest";
import {
  isRetryableRateLimit,
  parseRetryAfterMs,
  rateLimitBackoffMs,
} from "./agent-loop.js";

const RATE_LIMIT_BODY = JSON.stringify({
  error: { message: "Rate limit reached for gpt-5. Please try again in 20s.", type: "requests" },
});
const QUOTA_BODY = JSON.stringify({
  error: {
    message: "You exceeded your current quota, please check your plan and billing details.",
    type: "insufficient_quota",
    code: "insufficient_quota",
  },
});

describe("isRetryableRateLimit", () => {
  it("retries a plain 429 — the provider just wants the request later", () => {
    expect(isRetryableRateLimit(429, RATE_LIMIT_BODY)).toBe(true);
  });

  it("retries a 429 with no body or unparseable body", () => {
    expect(isRetryableRateLimit(429, "")).toBe(true);
    expect(isRetryableRateLimit(429, "<html>429</html>")).toBe(true);
  });

  it("does not retry exhausted quota — it will not clear in seconds", () => {
    // Regression: retrying quota exhaustion burns five backoffs and then shows
    // the same error later, which is worse than reporting it immediately.
    expect(isRetryableRateLimit(429, QUOTA_BODY)).toBe(false);
  });

  it("detects quota by message when the code is missing", () => {
    expect(isRetryableRateLimit(429, JSON.stringify({ error: { message: "Billing hard limit reached" } }))).toBe(false);
    expect(isRetryableRateLimit(429, JSON.stringify({ error: { message: "You are out of credits" } }))).toBe(false);
  });

  it("classifies 429 delivered as a top-level error string", () => {
    expect(isRetryableRateLimit(429, JSON.stringify({ error: "Too many requests" }))).toBe(true);
    expect(isRetryableRateLimit(429, JSON.stringify({ error: "insufficient_quota" }))).toBe(false);
  });

  it("ignores every other status", () => {
    for (const status of [400, 401, 403, 404, 408, 500, 502, 503, 529]) {
      expect(isRetryableRateLimit(status, RATE_LIMIT_BODY)).toBe(false);
    }
  });
});

describe("parseRetryAfterMs", () => {
  it("reads delay-seconds", () => {
    expect(parseRetryAfterMs("7")).toBe(7_000);
    expect(parseRetryAfterMs(" 0 ")).toBe(0);
  });

  it("reads an HTTP date relative to now", () => {
    const future = new Date(Date.now() + 5_000).toUTCString();
    const parsed = parseRetryAfterMs(future);
    expect(parsed).not.toBeNull();
    expect(parsed!).toBeGreaterThan(2_000);
    expect(parsed!).toBeLessThanOrEqual(5_000);
  });

  it("clamps a past date to zero rather than going negative", () => {
    expect(parseRetryAfterMs(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it("returns null for missing or garbage values", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs("soon")).toBeNull();
  });
});

describe("rateLimitBackoffMs", () => {
  it("doubles from 2s and caps at 30s", () => {
    expect(rateLimitBackoffMs(1, null)).toBe(2_000);
    expect(rateLimitBackoffMs(2, null)).toBe(4_000);
    expect(rateLimitBackoffMs(3, null)).toBe(8_000);
    expect(rateLimitBackoffMs(4, null)).toBe(16_000);
    expect(rateLimitBackoffMs(5, null)).toBe(30_000);
    expect(rateLimitBackoffMs(9, null)).toBe(30_000);
  });

  it("prefers the provider's Retry-After", () => {
    expect(rateLimitBackoffMs(1, 12_000)).toBe(12_000);
  });

  it("caps an excessive Retry-After so a turn cannot stall for minutes", () => {
    expect(rateLimitBackoffMs(1, 600_000)).toBe(30_000);
  });

  it("treats a non-positive Retry-After as zero delay", () => {
    expect(rateLimitBackoffMs(3, 0)).toBe(0);
    expect(rateLimitBackoffMs(3, -5_000)).toBe(0);
  });
});
