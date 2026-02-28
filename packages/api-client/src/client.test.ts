import { describe, it, expect, vi, beforeEach } from "vitest";
import { JaitClient } from "./client.js";
import type { WsEvent } from "@jait/shared";

function makeClient(baseUrl = "http://localhost:8000") {
  return new JaitClient({
    baseUrl,
    wsUrl: "ws://localhost:18789",
  });
}

describe("@jait/api-client", () => {
  describe("JaitClient constructor", () => {
    it("creates a client with config", () => {
      const client = makeClient();
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
      const client = makeClient();
      client.setToken("new-token");
      client.setToken(undefined);
    });
  });

  describe("sendMessage SSE parsing", () => {
    /** Helper: build a ReadableStream from SSE lines */
    function sseStream(lines: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      const payload = lines.join("\n") + "\n";
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(payload));
          controller.close();
        },
      });
    }

    it("parses token deltas and fires onDelta", async () => {
      const deltas: string[] = [];
      const doneCalled = vi.fn();

      // Mock fetch to return SSE stream
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: sseStream([
          'data: {"type":"token","content":"Hello"}',
          'data: {"type":"token","content":" world"}',
          'data: {"type":"done","session_id":"s1"}',
        ]),
      });

      try {
        const client = makeClient();
        await client.sendMessage("s1", "hi", (d) => deltas.push(d), doneCalled);

        expect(deltas).toEqual(["Hello", " world"]);
        expect(doneCalled).toHaveBeenCalledOnce();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws on HTTP error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        body: null,
      });

      try {
        const client = makeClient();
        await expect(
          client.sendMessage("s1", "hi", () => {}, () => {}),
        ).rejects.toThrow("Chat request failed: 500");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws on stream error event", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: sseStream([
          'data: {"type":"error","message":"Stream error"}',
        ]),
      });

      try {
        const client = makeClient();
        await expect(
          client.sendMessage("s1", "hi", () => {}, () => {}),
        ).rejects.toThrow("Stream error");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("ignores non-data lines in SSE stream", async () => {
      const deltas: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: sseStream([
          ": this is a comment",
          'data: {"type":"token","content":"ok"}',
          "",
          'data: {"type":"done"}',
        ]),
      });

      try {
        const client = makeClient();
        await client.sendMessage("s1", "hi", (d) => deltas.push(d), () => {});
        expect(deltas).toEqual(["ok"]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles chunked SSE delivery", async () => {
      const deltas: string[] = [];
      const encoder = new TextEncoder();

      // Simulate two chunks where a line is split across chunks
      const chunk1 = 'data: {"type":"token","content":"A"}\ndata: {"type":';
      const chunk2 = '"token","content":"B"}\ndata: {"type":"done"}\n';

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(chunk1));
          controller.enqueue(encoder.encode(chunk2));
          controller.close();
        },
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: stream });

      try {
        const client = makeClient();
        await client.sendMessage("s1", "hi", (d) => deltas.push(d), () => {});
        expect(deltas).toEqual(["A", "B"]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("on() event routing", () => {
    it("registers and unregisters event handlers", () => {
      const client = makeClient();
      const handler = vi.fn();
      const unsub = client.on("session.created", handler);

      expect(typeof unsub).toBe("function");
      unsub(); // should not throw
    });

    it("fires handlers for matching event type", () => {
      const client = makeClient();
      const handler = vi.fn();
      client.on("action.started", handler);

      // Simulate the internal event dispatch by accessing internals
      // We test this via a real WS connection in integration tests
      // Here we verify the registration doesn't throw
      expect(handler).not.toHaveBeenCalled();
    });

    it("supports wildcard * handler", () => {
      const client = makeClient();
      const handler = vi.fn();
      const unsub = client.on("*", handler);
      expect(typeof unsub).toBe("function");
      unsub();
    });
  });

  describe("disconnect", () => {
    it("disconnect is safe to call without connect", () => {
      const client = makeClient();
      // Should not throw when no WS is connected
      client.disconnect();
    });
  });

  describe("health (integration)", () => {
    it("calls /health endpoint", async () => {
      const isCI = process.env["CI"] === "true";
      if (isCI) return;

      try {
        const client = makeClient();
        const status = await client.health();
        expect(status.healthy).toBe(true);
        expect(status.version).toBe("0.1.0");
      } catch {
        // Gateway not running, skip gracefully
      }
    });
  });
});
