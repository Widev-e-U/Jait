import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { loadConfig } from "../config.js";
import { VoiceAssistantService } from "./service.js";

const fakes = vi.hoisted(() => ({ sockets: [] as any[] }));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class Socket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    sent: any[] = [];
    constructor(..._args: any[]) { super(); fakes.sockets.push(this); }
    send(data: string) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
  }
  class Server extends EventEmitter { handleUpgrade() {} }
  return { WebSocket: Socket, WebSocketServer: Server };
});

describe("voice wake-word handoff", () => {
  it("forwards one initial request as a user turn after the upstream session starts", async () => {
    fakes.sockets.length = 0;
    const service = new VoiceAssistantService({
      config: { ...loadConfig(), openaiApiKey: "test-key" },
      verifyToken: async () => ({ id: "user", username: "Alice" }),
    });
    const client = new (WebSocket as any)();
    await (service as any).handleConnection(client, { url: "/ws/voice-assistant?token=test", headers: { host: "localhost" } });
    const upstream = fakes.sockets[1];
    upstream.emit("open");
    client.emit("message", JSON.stringify({ type: "initial_text", text: "check my network" }));
    client.emit("message", JSON.stringify({ type: "initial_text", text: "duplicate" }));
    const turns = upstream.sent.filter((event: any) => event.type === "conversation.item.create");
    expect(turns).toEqual([{ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "check my network" }] } }]);
    expect(upstream.sent.filter((event: any) => event.type === "response.create")).toHaveLength(1);
    expect(client.sent).toContainEqual({ type: "status", status: "thinking" });
  });
});
