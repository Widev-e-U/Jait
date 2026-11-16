import { randomUUID } from "node:crypto";
import { messengerCommandSchema, type MessengerCommand, type MessengerRequest, type MessengerToolResponse } from "@jait/shared";

interface BrowserClient {
  userId: string;
  send: (request: MessengerRequest) => void;
  active: () => boolean;
}

/** Owner-scoped assistant dispatch. The gateway handler takes precedence over legacy browser RPC. */
export class MessengerBridge {
  private gatewayHandler?: (owner: string, command: MessengerCommand, signal?: AbortSignal) => Promise<MessengerToolResponse>;
  setGatewayHandler(handler: typeof this.gatewayHandler) { this.gatewayHandler = handler; }
  private clients = new Map<string, BrowserClient>();
  private pending = new Map<string, { clientId: string; finish: (result: MessengerToolResponse) => void }>();

  register(clientId: string, browser: BrowserClient) {
    this.unregister(clientId);
    this.clients.set(clientId, browser);
  }

  unregister(clientId: string) {
    this.clients.delete(clientId);
    for (const pending of this.pending.values()) {
      if (pending.clientId === clientId) pending.finish({ ok: false, message: "Messenger access ended. If a send was in progress, check the room before retrying." });
    }
  }

  complete(clientId: string, userId: string, requestId: string, result: MessengerToolResponse) {
    const pending = this.pending.get(requestId);
    if (pending?.clientId !== clientId || this.clients.get(clientId)?.userId !== userId) return;
    if (typeof result?.ok !== "boolean" || typeof result.message !== "string") return;
    // Never retain arbitrary browser output or oversized message history.
    if (JSON.stringify(result).length > 150_000) {
      pending.finish({ ok: false, message: "Messenger output exceeded the limit. Narrow your query." });
      return;
    }
    pending.finish({ ok: result.ok, message: result.message.slice(0, 2000), data: result.data });
  }

  async request(userId: string | undefined, input: MessengerCommand, signal?: AbortSignal, timeoutMs = 15_000): Promise<MessengerToolResponse> {
    const parsed = messengerCommandSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Invalid Messenger command." };
    if (!userId) return { ok: false, message: "An authenticated Jait user is required." };
    if (signal?.aborted) return { ok: false, message: "Cancelled." };
    if (this.gatewayHandler) return this.gatewayHandler(userId, parsed.data, signal);
    // Attachment bytes and encryption metadata must stay on the gateway; the legacy browser RPC is not an attachment transport.
    if (parsed.data.action === "attachment") return { ok: false, message: "Attachment retrieval requires the gateway-owned Messenger connection." };
    const clients = [...this.clients].filter(([, client]) => client.userId === userId && client.active());
    if (clients.length !== 1) return {
      ok: false,
      message: clients.length ? "Multiple Messenger tabs have assistant access enabled. Disable it in all but the intended tab."
        : "Open /messenger, connect Matrix, and enable Allow assistant access in Connections.",
    };
    const [clientId, client] = clients[0]!;
    if (this.pending.size >= 32) return { ok: false, message: "Messenger is busy. Try again later." };
    const requestId = randomUUID();
    return new Promise(resolve => {
      const finish = (result: MessengerToolResponse) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        this.pending.delete(requestId);
        resolve(result);
      };
      const cancel = () => finish({ ok: false, message: "Cancelled. If sending had started, check the room before retrying." });
      const timer = setTimeout(() => finish({ ok: false, message: "Messenger timed out. If sending had started, delivery is uncertain; check the room before retrying." }), timeoutMs);
      this.pending.set(requestId, { clientId, finish });
      signal?.addEventListener("abort", cancel, { once: true });
      try { client.send({ requestId, expiresAt: Date.now() + timeoutMs, command: parsed.data }); }
      catch { finish({ ok: false, message: "Messenger browser disconnected." }); }
    });
  }

  stop() {
    for (const id of this.clients.keys()) this.unregister(id);
  }
}
