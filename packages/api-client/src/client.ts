import type {
  GatewayStatus,
  ChatMessage,
  WsEvent,
  WsEventType,
} from "@jait/shared";

export interface JaitClientConfig {
  baseUrl: string;
  wsUrl: string;
  token?: string;
}

export class JaitClient {
  private config: JaitClientConfig;
  private ws: WebSocket | null = null;
  private eventHandlers = new Map<string, Set<(event: WsEvent) => void>>();

  constructor(config: JaitClientConfig) {
    this.config = config;
  }

  /** Update the auth token (e.g. after login or refresh) */
  setToken(token: string | undefined) {
    this.config.token = token;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.token) {
      h["Authorization"] = `Bearer ${this.config.token}`;
    }
    return h;
  }

  // --- REST API ---

  async health(): Promise<GatewayStatus> {
    const res = await fetch(`${this.config.baseUrl}/health`, {
      headers: this.headers,
    });
    return (await res.json()) as GatewayStatus;
  }

  async getMessages(sessionId: string): Promise<{ messages: ChatMessage[] }> {
    const res = await fetch(
      `${this.config.baseUrl}/api/sessions/${sessionId}/messages`,
      { headers: this.headers },
    );
    return (await res.json()) as { messages: ChatMessage[] };
  }

  async sendMessage(
    sessionId: string,
    content: string,
    onDelta: (delta: string) => void,
    onDone: () => void,
  ): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ content, sessionId }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Chat request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6)) as {
            type?: string;
            content?: string;
            message?: string;
            session_id?: string;
          };
          if (data.type === "token" && data.content) onDelta(data.content);
          if (data.type === "done") onDone();
          if (data.type === "error") {
            throw new Error(data.message ?? "Stream error");
          }
        } catch (err) {
          if (err instanceof Error && err.message !== "Stream error") continue;
          throw err;
        }
      }
    }
  }

  // --- WebSocket ---

  connect(sessionId: string, deviceId: string) {
    this.ws = new WebSocket(this.config.wsUrl);

    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({ type: "subscribe", sessionId, deviceId }),
      );
    };

    this.ws.onmessage = (event) => {
      try {
        const wsEvent = JSON.parse(
          typeof event.data === "string" ? event.data : "",
        ) as WsEvent;

        // Fire type-specific handlers
        const handlers = this.eventHandlers.get(wsEvent.type);
        if (handlers) {
          for (const handler of handlers) handler(wsEvent);
        }

        // Fire wildcard handlers
        const wildcardHandlers = this.eventHandlers.get("*");
        if (wildcardHandlers) {
          for (const handler of wildcardHandlers) handler(wsEvent);
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
    };
  }

  on(type: WsEventType | "*", handler: (event: WsEvent) => void): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler);

    return () => {
      this.eventHandlers.get(type)?.delete(handler);
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
