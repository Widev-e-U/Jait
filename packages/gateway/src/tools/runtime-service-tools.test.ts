import { describe, expect, it, vi } from "vitest";
import type { VoiceService } from "../voice/service.js";
import type { ChatTracesService } from "../services/chat-traces.js";
import type { SessionSqlService } from "../services/session-sql.js";
import type { MaintenanceService } from "../services/maintenance.js";
import { createVoiceSpeakTool } from "./voice-tools.js";
import { createChatTracesTool } from "./chat-traces-tools.js";
import { createSessionSqlTool } from "./session-sql-tools.js";
import { createMaintenanceRunTool } from "./maintenance-tools.js";
import { createGatewayStatusTool } from "./gateway-tools.js";

const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
describe("voice.speak", () => {
  it("speaks trimmed text in the correct session and returns audio metadata", async () => {
    const service = { speak: vi.fn().mockReturnValue({ mimeType: "audio/wav", audioBase64: "YXVkaW8=" }) };
    expect(await createVoiceSpeakTool(service as unknown as VoiceService).execute({ text: "  Checks passed  " }, context)).toMatchObject({ ok: true, data: { mimeType: "audio/wav", bytes: 8 } });
    expect(service.speak).toHaveBeenCalledWith({ sessionId: context.sessionId, text: "Checks passed" });
  });
  it("rejects empty speech without invoking TTS", async () => {
    const service = { speak: vi.fn() };
    expect((await createVoiceSpeakTool(service as unknown as VoiceService).execute({ text: " " }, context)).ok).toBe(false);
    expect(service.speak).not.toHaveBeenCalled();
  });
});
describe("chat.traces", () => {
  it("queries persisted traces using caller ownership and requested limits", async () => {
    const traces = { found: true, counts: { messages: 2, threads: 1, threadActivities: 3 }, threads: [{ status: "completed", kind: "agent", title: "Browser checks" }] };
    const service = { traces: vi.fn().mockReturnValue(traces) };
    expect(await createChatTracesTool(service as unknown as ChatTracesService).execute({ chatId: "chat-1", messageLimit: 5, includeThinking: false }, context)).toMatchObject({ ok: true, data: traces });
    expect(service.traces).toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat-1", userId: "owner-1", messageLimit: 5, includeThinking: false }));
  });
  it("reports a missing or inaccessible chat", async () => {
    const service = { traces: vi.fn().mockReturnValue({ found: false }) };
    expect(await createChatTracesTool(service as unknown as ChatTracesService).execute({ chatId: "foreign-chat" }, context)).toMatchObject({ ok: false, data: { found: false } });
  });
});
describe("session.sql", () => {
  it("returns schema without executing SQL", async () => {
    const service = { schema: vi.fn().mockReturnValue({ ok: true, data: { tables: ["sessions"] } }), query: vi.fn() };
    expect(await createSessionSqlTool(service as unknown as SessionSqlService).execute({ mode: "schema" }, context)).toMatchObject({ ok: true, data: { tables: ["sessions"] } });
    expect(service.query).not.toHaveBeenCalled();
  });
  it("forwards the row limit and exposes truncation", async () => {
    const service = { query: vi.fn().mockReturnValue({ ok: true, data: { rowCount: 5, truncated: true, rows: [] } }) };
    const result = await createSessionSqlTool(service as unknown as SessionSqlService).execute({ sql: "SELECT id FROM sessions", max_rows: 5 }, context);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("truncated");
    expect(service.query).toHaveBeenCalledWith({ sql: "SELECT id FROM sessions", maxRows: 5 });
  });
  it("preserves the service's refusal of unsafe SQL", async () => {
    const service = { query: vi.fn().mockReturnValue({ ok: false, message: "Read-only SELECT required", error: "unsafe_query" }) };
    expect(await createSessionSqlTool(service as unknown as SessionSqlService).execute({ sql: "DELETE FROM sessions" }, context)).toEqual({ ok: false, message: "Read-only SELECT required", data: { error: "unsafe_query" } });
  });
  it("rejects missing SQL without calling the service", async () => {
    const service = { query: vi.fn() };
    expect((await createSessionSqlTool(service as unknown as SessionSqlService).execute({}, context)).ok).toBe(false);
    expect(service.query).not.toHaveBeenCalled();
  });
});
describe("maintenance.run", () => {
  it("returns the reviewable fix plan when checks fail", async () => {
    const service = { runForRepo: vi.fn().mockResolvedValue({
      id: "run-1", repoName: "Workbench", allPassed: false, planId: "plan-1",
      checks: [{ passed: false, name: "typecheck", durationMs: 20 }],
    }) };
    const result = await createMaintenanceRunTool(service as unknown as MaintenanceService).execute({ repoId: "repo-1" }, context);
    expect(result).toMatchObject({ ok: true, data: { runId: "run-1", planId: "plan-1", summary: expect.stringContaining("✗ typecheck") } });
    expect(service.runForRepo).toHaveBeenCalledWith("repo-1", context.actionId);
  });
  it("reports no accessible repositories without claiming checks passed", async () => {
    const service = { runAll: vi.fn().mockResolvedValue([]) };
    expect(await createMaintenanceRunTool(service as unknown as MaintenanceService).execute({}, context)).toEqual({ ok: true, message: "No accessible repositories found" });
  });
  it("reports execution failures", async () => {
    const service = { runForRepo: vi.fn().mockRejectedValue(new Error("Execution node offline")) };
    expect(await createMaintenanceRunTool(service as unknown as MaintenanceService).execute({ repoId: "repo-1" }, context)).toEqual({ ok: false, message: "Execution node offline" });
  });
});
describe("gateway.status", () => {
  it("reports session, surface and enabled job counts", async () => {
    const deps = {
      sessionService: { list: vi.fn().mockReturnValue([{}, {}]) }, surfaceRegistry: { listSurfaces: () => [{}] },
      ws: { clientCount: 3 }, startedAt: Date.now() - 5000,
      scheduler: { list: () => [{ enabled: true }, { enabled: false }] },
      hooks: { registeredEventTypes: () => ["session.created"], listenerCount: () => 1 },
    };
    const tool = createGatewayStatusTool(deps as unknown as Parameters<typeof createGatewayStatusTool>[0]);
    expect(await tool.execute({}, context)).toMatchObject({ ok: true, data: {
      sessions: 2, surfaces: 1, devices: 3, scheduler: { totalJobs: 2, enabledJobs: 1 },
      hooks: { registeredEventTypes: ["session.created"], listeners: 1 },
    } });
    expect(deps.sessionService.list).toHaveBeenCalledWith("active");
  });
});
