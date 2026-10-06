import type {
  SecurityCheckInput, SecurityCheckRun, SecurityWorkbenchHistory, SecurityEngineStatus, SecurityRemediationPlan, SecurityVerificationResult, SecurityFinding,
  SecurityAssessmentHistory,
  SecurityAssessmentRun,
  SecurityScope,
  SecurityScopeInput,
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

  private async assessmentRequest<T>(path: string, body?: unknown, method?: "DELETE"): Promise<T> {
    const res = await fetch(this.config.baseUrl + path, {
      headers: this.headers, credentials: "include",
      method: method ?? (body === undefined ? "GET" : "POST"),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await res.json() as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Assessment request failed");
    return data;
  }

  compareSecurityChecks(beforeRunId: string, afterRunId: string): Promise<import("@jait/shared").SecurityBaselineComparison> { return this.assessmentRequest("/api/security/comparisons", {beforeRunId, afterRunId}); }
  securityWorkbench(): Promise<SecurityWorkbenchHistory> { return this.assessmentRequest("/api/security/workbench"); }
  securityEngineStatus(): Promise<SecurityEngineStatus[]> { return this.assessmentRequest("/api/security/engines"); }
  startSecurityCheck(input: SecurityCheckInput): Promise<SecurityCheckRun> { return this.assessmentRequest("/api/security/checks", input); }
  getSecurityCheck(id: string): Promise<SecurityCheckRun> { return this.assessmentRequest("/api/security/checks/" + encodeURIComponent(id)); }
  cancelSecurityCheck(id: string): Promise<{ok: boolean}> { return this.assessmentRequest("/api/security/checks/" + encodeURIComponent(id) + "/cancel", {}); }
  deleteSecurityCheck(id: string): Promise<{ok: boolean}> { return this.assessmentRequest("/api/security/checks/" + encodeURIComponent(id), undefined, "DELETE"); }
  exportSecurityReport(id: string): Promise<Record<string, unknown>> { return this.assessmentRequest("/api/security/checks/" + encodeURIComponent(id) + "/report"); }
  getSecurityRemediationPlan(id: string): Promise<SecurityRemediationPlan> { return this.assessmentRequest("/api/security/findings/" + encodeURIComponent(id) + "/plan"); }
  verifySecurityFinding(id: string): Promise<SecurityVerificationResult> { return this.assessmentRequest("/api/security/findings/" + encodeURIComponent(id) + "/verify", {}); }
  decideSecurityFinding(id: string, disposition: "open" | "accepted-risk" | "false-positive"): Promise<SecurityFinding> { return this.assessmentRequest("/api/security/findings/" + encodeURIComponent(id) + "/decision", {disposition}); }
  scheduleSecurityMonitor(input: SecurityCheckInput & {minutes: number}): Promise<{jobId: string; expiresAt: string}> { return this.assessmentRequest("/api/security/monitors", input); }

  securityAssessments(): Promise<SecurityAssessmentHistory> {
    return this.assessmentRequest("/api/security/assessments");
  }
  createSecurityScope(input: SecurityScopeInput & { sessionId?: string }): Promise<SecurityScope> {
    return this.assessmentRequest("/api/security/scopes", input);
  }
  startSecurityAssessment(scopeId: string): Promise<SecurityAssessmentRun> {
    return this.assessmentRequest("/api/security/assessments", { scopeId });
  }
  getSecurityAssessment(id: string): Promise<SecurityAssessmentRun> {
    return this.assessmentRequest("/api/security/assessments/" + encodeURIComponent(id));
  }
  cancelSecurityAssessment(id: string): Promise<{ ok: boolean }> {
    return this.assessmentRequest("/api/security/assessments/" + encodeURIComponent(id) + "/cancel", {});
  }


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
    const processLine = (
      line: string,
      onDelta: (delta: string) => void,
      onDone: () => void,
    ) => {
      if (!line.startsWith("data: ")) return;

      let data: {
        type?: string;
        content?: string;
        message?: string;
        session_id?: string;
      };

      try {
        data = JSON.parse(line.slice(6)) as {
          type?: string;
          content?: string;
          message?: string;
          session_id?: string;
        };
      } catch {
        return;
      }

      if (data.type === "token" && data.content) onDelta(data.content);
      if (data.type === "done") onDone();
      if (data.type === "error") {
        throw new Error(data.message ?? "Stream error");
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line, onDelta, onDone);
      }
    }

    if (buffer) {
      processLine(buffer, onDelta, onDone);
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
