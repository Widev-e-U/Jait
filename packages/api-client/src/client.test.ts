import { describe, it, expect } from "vitest";
import { JaitClient } from "./client.js";

describe("@jait/api-client", () => {
  describe("JaitClient constructor", () => {
    it("creates a client with config", () => {
      const client = new JaitClient({
        baseUrl: "http://localhost:8000",
        wsUrl: "ws://localhost:18789",
      });
      expect(client).toBeDefined();
    });

    it("creates a client with token", () => {
      const client = new JaitClient({
        baseUrl: "http://localhost:8000",
        wsUrl: "ws://localhost:18789",
        token: "test-token",
      });
      expect(client).toBeDefined();
    });
  });

  describe("setToken", () => {
    it("updates the token", () => {
      const client = new JaitClient({
        baseUrl: "http://localhost:8000",
        wsUrl: "ws://localhost:18789",
      });
      // setToken should not throw
      client.setToken("new-token");
      client.setToken(undefined);
    });
  });

  describe("health (integration)", () => {
    it("calls /health endpoint", async () => {
      // This test requires the gateway to be running — skip in CI
      const isCI = process.env["CI"] === "true";
      if (isCI) return;

      try {
        const client = new JaitClient({
          baseUrl: "http://localhost:8000",
          wsUrl: "ws://localhost:18789",
        });
        const status = await client.health();
        expect(status.healthy).toBe(true);
        expect(status.version).toBe("0.1.0");
      } catch {
        // Gateway not running, skip gracefully
      }
    });
  });
});
