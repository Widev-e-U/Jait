/**
 * Sprint 4 Tests — Consent Manager & Tool Permissions
 *
 * Covers: ConsentManager, ToolPermissions, ToolProfiles,
 * TrustEngine, ConsentAwareExecutor, consent routes, trust routes.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Consent Manager ──────────────────────────────────────────────────

import { ConsentManager } from "./security/consent-manager.js";

describe("ConsentManager", () => {
  it("creates a pending request and resolves on approve", async () => {
    const onReq = vi.fn();
    const onDec = vi.fn();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000, onRequest: onReq, onDecision: onDec });

    // Start the request (non-blocking)
    const promise = cm.requestConsent({
      actionId: "act-1",
      toolName: "terminal.run",
      summary: "Run ls",
      preview: { command: "ls" },
      risk: "medium",
      sessionId: "s1",
    });

    // Should be pending
    expect(cm.pendingCount).toBe(1);
    expect(cm.listPending()).toHaveLength(1);
    expect(cm.listPending("s1")).toHaveLength(1);
    expect(cm.listPending("other")).toHaveLength(0);
    expect(onReq).toHaveBeenCalledOnce();

    // Approve
    const ok = cm.approve(cm.listPending()[0]!.id);
    expect(ok).toBe(true);

    const decision = await promise;
    expect(decision.approved).toBe(true);
    expect(decision.decidedVia).toBe("click");
    expect(cm.pendingCount).toBe(0);
    expect(onDec).toHaveBeenCalledOnce();
  });

  it("rejects a pending request", async () => {
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });

    const promise = cm.requestConsent({
      actionId: "act-2",
      toolName: "os.install",
      summary: "Install git",
      preview: { package: "git" },
      risk: "high",
      sessionId: "s1",
    });

    const req = cm.listPending()[0]!;
    cm.reject(req.id, "click", "Not needed");

    const decision = await promise;
    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe("Not needed");
  });

  it("auto-rejects after timeout", async () => {
    const cm = new ConsentManager({ defaultTimeoutMs: 50 });

    const decision = await cm.requestConsent({
      actionId: "act-3",
      toolName: "terminal.run",
      summary: "Run something",
      preview: { command: "echo hi" },
      risk: "medium",
      sessionId: "s1",
      timeoutMs: 50,
    });

    expect(decision.approved).toBe(false);
    expect(decision.decidedVia).toBe("timeout");
  });

  it("getRequest returns the correct request", async () => {
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });

    cm.requestConsent({
      actionId: "act-4",
      toolName: "file.write",
      summary: "Write file",
      preview: { path: "/tmp/test.txt" },
      risk: "medium",
      sessionId: "s1",
    });

    const req = cm.listPending()[0]!;
    expect(cm.getRequest(req.id)).toBeDefined();
    expect(cm.getRequest(req.id)!.toolName).toBe("file.write");
    expect(cm.getRequest("nonexistent")).toBeUndefined();

    // Clean up
    cm.cancelAll();
  });

  it("cancelAll rejects all pending", async () => {
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });

    const p1 = cm.requestConsent({
      actionId: "act-5",
      toolName: "terminal.run",
      summary: "Run a",
      preview: {},
      risk: "medium",
      sessionId: "s1",
    });
    const p2 = cm.requestConsent({
      actionId: "act-6",
      toolName: "terminal.run",
      summary: "Run b",
      preview: {},
      risk: "medium",
      sessionId: "s1",
    });

    expect(cm.pendingCount).toBe(2);
    cm.cancelAll("shutdown");

    const [d1, d2] = await Promise.all([p1, p2]);
    expect(d1.approved).toBe(false);
    expect(d2.approved).toBe(false);
    expect(cm.pendingCount).toBe(0);
  });

  it("approve/reject returns false for unknown request", () => {
    const cm = new ConsentManager();
    expect(cm.approve("nonexistent")).toBe(false);
    expect(cm.reject("nonexistent")).toBe(false);
  });
});

// ── Tool Permissions ─────────────────────────────────────────────────

import {
  requiresConsent,
  isCommandAllowed,
  isPathAllowedByPermission,
  matchGlob,
  type ToolPermission,
} from "./security/tool-permissions.js";

describe("ToolPermissions", () => {
  const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    deniedCommands: ["rm -rf *", "format *"],
  };

  const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
  };

  const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };

  const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
  };

  describe("requiresConsent", () => {
    it("none → never needs consent", () => {
      expect(requiresConsent(fileReadPerm, 0, new Set())).toBe(false);
    });

    it("once → needs consent first time", () => {
      expect(requiresConsent(oncePerm, 0, new Set())).toBe(true);
    });

    it("once → auto after session approval", () => {
      expect(requiresConsent(oncePerm, 0, new Set(["file.write"]))).toBe(false);
    });

    it("once → auto at trust level 2+", () => {
      expect(requiresConsent(oncePerm, 2, new Set())).toBe(false);
    });

    it("always → needs consent at trust 0-2", () => {
      expect(requiresConsent(terminalPerm, 0, new Set())).toBe(true);
      expect(requiresConsent(terminalPerm, 2, new Set())).toBe(true);
    });

    it("always → auto at trust level 3 (autopilot)", () => {
      expect(requiresConsent(terminalPerm, 3, new Set())).toBe(false);
    });

    it("dangerous → always needs consent regardless of trust", () => {
      expect(requiresConsent(dangerousPerm, 3, new Set())).toBe(true);
    });

    it("unknown tool → needs consent", () => {
      expect(requiresConsent(undefined, 3, new Set())).toBe(true);
    });
  });

  describe("isCommandAllowed", () => {
    it("allows normal commands", () => {
      expect(isCommandAllowed("ls -la", terminalPerm).allowed).toBe(true);
    });

    it("blocks denied commands", () => {
      const result = isCommandAllowed("rm -rf *", terminalPerm);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("denied pattern");
    });

    it("allows everything when no permission defined", () => {
      expect(isCommandAllowed("rm -rf /", undefined).allowed).toBe(true);
    });
  });

  describe("isPathAllowedByPermission", () => {
    it("allows paths matching allowed patterns", () => {
      expect(isPathAllowedByPermission("src/index.ts", oncePerm).allowed).toBe(true);
    });

    it("blocks paths matching denied patterns", () => {
      expect(isPathAllowedByPermission(".env", oncePerm).allowed).toBe(false);
    });

    it("blocks paths not in allowed list", () => {
      expect(isPathAllowedByPermission("dist/bundle.js", oncePerm).allowed).toBe(false);
    });
  });

  describe("matchGlob", () => {
    it("matches wildcard", () => {
      expect(matchGlob("hello.ts", "*.ts")).toBe(true);
      expect(matchGlob("hello.js", "*.ts")).toBe(false);
    });

    it("matches globstar", () => {
      expect(matchGlob("src/deep/file.ts", "src/**")).toBe(true);
    });

    it("matches question mark", () => {
      expect(matchGlob("file1.ts", "file?.ts")).toBe(true);
      expect(matchGlob("file12.ts", "file?.ts")).toBe(false);
    });

    it("case insensitive", () => {
      expect(matchGlob("README.md", "readme.md")).toBe(true);
    });
  });
});

// ── Tool Profiles ────────────────────────────────────────────────────

import { getProfile, listProfiles, extendProfile } from "./security/tool-profiles.js";

describe("ToolProfiles", () => {
  it("lists available profiles", () => {
    const profiles = listProfiles();
    expect(profiles).toContain("minimal");
    expect(profiles).toContain("coding");
    expect(profiles).toContain("full");
  });

  it("minimal profile: file.read is none, terminal.run is dangerous", () => {
    const perms = getProfile("minimal");
    expect(perms.get("file.read")?.consentLevel).toBe("none");
    expect(perms.get("terminal.run")?.consentLevel).toBe("dangerous");
  });

  it("coding profile: file.write is once, terminal.run is always", () => {
    const perms = getProfile("coding");
    expect(perms.get("file.write")?.consentLevel).toBe("once");
    expect(perms.get("terminal.run")?.consentLevel).toBe("always");
  });

  it("full profile: terminal.run is once", () => {
    const perms = getProfile("full");
    expect(perms.get("terminal.run")?.consentLevel).toBe("once");
  });

  it("extendProfile overrides specific tools", () => {
    const perms = extendProfile("minimal", [
      { toolName: "terminal.run", consentLevel: "once", risk: "medium" },
    ]);
    expect(perms.get("terminal.run")?.consentLevel).toBe("once");
    expect(perms.get("file.read")?.consentLevel).toBe("none"); // unchanged
  });

  it("all profiles cover all 12 Sprint 3 tools", () => {
    const expectedTools = [
      "file.read", "file.list", "file.stat", "file.write", "file.patch",
      "terminal.run", "terminal.stream",
      "os.query", "os.install",
      "surfaces.list", "surfaces.start", "surfaces.stop",
    ];

    for (const name of listProfiles()) {
      const perms = getProfile(name);
      for (const tool of expectedTools) {
        expect(perms.has(tool), `${name} missing ${tool}`).toBe(true);
      }
    }
  });
});

// ── Trust Engine ─────────────────────────────────────────────────────

import { TrustEngine } from "./security/trust-engine.js";

describe("TrustEngine", () => {
  it("starts at level 0", () => {
    const engine = new TrustEngine();
    expect(engine.getLevel("terminal.run")).toBe(0);
  });

  it("levels up after 3 approvals → level 1", () => {
    const engine = new TrustEngine();
    engine.recordApproval("terminal.run");
    engine.recordApproval("terminal.run");
    const state = engine.recordApproval("terminal.run");
    expect(state.currentLevel).toBe(1);
    expect(state.approvedCount).toBe(3);
  });

  it("levels up after 10 approvals → level 2", () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 10; i++) engine.recordApproval("file.write");
    expect(engine.getLevel("file.write")).toBe(2);
  });

  it("levels up after 25 approvals → level 3 (autopilot)", () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 25; i++) engine.recordApproval("file.write");
    expect(engine.getLevel("file.write")).toBe(3);
  });

  it("revert drops one level", () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 10; i++) engine.recordApproval("file.write");
    expect(engine.getLevel("file.write")).toBe(2);

    engine.recordRevert("file.write");
    expect(engine.getLevel("file.write")).toBe(1);
  });

  it("revert at level 0 stays at 0", () => {
    const engine = new TrustEngine();
    engine.recordRevert("terminal.run");
    expect(engine.getLevel("terminal.run")).toBe(0);
  });

  it("reset returns to level 0", () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 10; i++) engine.recordApproval("file.write");
    engine.reset("file.write");
    expect(engine.getLevel("file.write")).toBe(0);
  });

  it("tracks independent action types", () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 3; i++) engine.recordApproval("terminal.run");
    expect(engine.getLevel("terminal.run")).toBe(1);
    expect(engine.getLevel("file.write")).toBe(0);
  });

  it("getState returns full state", () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 5; i++) engine.recordApproval("file.write");
    engine.recordRevert("file.write");

    const state = engine.getState("file.write");
    expect(state.approvedCount).toBe(5);
    expect(state.revertedCount).toBe(1);
    expect(state.currentLevel).toBe(0); // was 1 (from 3 approvals), revert dropped to 0
  });
});

// ── ConsentAwareExecutor ─────────────────────────────────────────────

import { ConsentAwareExecutor } from "./security/consent-executor.js";
import { ToolRegistry } from "./tools/registry.js";

describe("ConsentAwareExecutor", () => {
  function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

  it("auto-executes tools with consent level none", async () => {
    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding"); // file.read is "none"

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const result = await executor.execute("file.read", { path: "test.txt" }, {
      sessionId: "s1",
      actionId: "a1",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe("file contents");
    expect(cm.pendingCount).toBe(0);
  });

  it("requires consent for terminal.run (always consent)", async () => {
    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    // Start execution (will block waiting for consent)
    const promise = executor.execute("terminal.run", { command: "ls" }, {
      sessionId: "s1",
      actionId: "a2",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });

    // Should have a pending request
    expect(cm.pendingCount).toBe(1);

    // Approve it
    const req = cm.listPending()[0]!;
    cm.approve(req.id);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.message).toBe("done");
  });

  it("rejects if consent is denied", async () => {
    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const promise = executor.execute("terminal.run", { command: "ls" }, {
      sessionId: "s1",
      actionId: "a3",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });

    const req = cm.listPending()[0]!;
    cm.reject(req.id, "click", "Too risky");

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.message).toContain("rejected");
  });

  it("dry-run returns plan without executing", async () => {
    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const result = await executor.execute("terminal.run", { command: "ls" }, {
      sessionId: "s1",
      actionId: "a4",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    }, { dryRun: true });

    expect(result.ok).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.dryRun).toBe(true);
    expect(data.requiresConsent).toBe(true);
    expect(data.toolName).toBe("terminal.run");
    expect(cm.pendingCount).toBe(0); // no actual request created
  });

  it("blocks denied commands", async () => {
    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding"); // coding denies "rm -rf *"

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const result = await executor.execute("terminal.run", { command: "rm -rf *" }, {
      sessionId: "s1",
      actionId: "a5",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("blocked");
  });

  it("records trust progression after approved execution", async () => {
    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    // Execute file.read 3 times (auto-execute, no consent needed)
    for (let i = 0; i < 3; i++) {
      await executor.execute("file.read", { path: "test.txt" }, {
        sessionId: "s1",
        actionId: `a${i}`,
        workspaceRoot: "/tmp",
        requestedBy: "test",
      });
    }

    // Trust should have increased
    expect(te.getLevel("file.read")).toBe(1);
  });
});

// ── Consent Routes ───────────────────────────────────────────────────

import { createServer } from "./server.js";
import { loadConfig } from "./config.js";

describe("Consent & Trust Routes", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let consentManager: ConsentManager;
  let trustEngine: TrustEngine;

  beforeEach(async () => {
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  });

  it("GET /api/consent/pending returns empty initially", async () => {
    const res = await app.inject({ method: "GET", url: "/api/consent/pending" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { requests: unknown[] };
    expect(body.requests).toHaveLength(0);
  });

  it("GET /api/consent/pending returns pending requests", async () => {
    // Create a pending request
    consentManager.requestConsent({
      actionId: "act-1",
      toolName: "terminal.run",
      summary: "Run ls",
      preview: { command: "ls" },
      risk: "medium",
      sessionId: "s1",
    });

    const res = await app.inject({ method: "GET", url: "/api/consent/pending" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { requests: { id: string; toolName: string }[] };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]!.toolName).toBe("terminal.run");

    // Clean up
    consentManager.cancelAll();
  });

  it("POST /api/consent/:id/approve approves a request", async () => {
    const promise = consentManager.requestConsent({
      actionId: "act-2",
      toolName: "file.write",
      summary: "Write file",
      preview: { path: "test.txt" },
      risk: "medium",
      sessionId: "s1",
    });

    const req = consentManager.listPending()[0]!;

    const res = await app.inject({
      method: "POST",
      url: `/api/consent/${req.id}/approve`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, decision: "approved" });

    const decision = await promise;
    expect(decision.approved).toBe(true);
  });

  it("POST /api/consent/:id/reject rejects a request", async () => {
    const promise = consentManager.requestConsent({
      actionId: "act-3",
      toolName: "os.install",
      summary: "Install pkg",
      preview: {},
      risk: "high",
      sessionId: "s1",
    });

    const req = consentManager.listPending()[0]!;

    const res = await app.inject({
      method: "POST",
      url: `/api/consent/${req.id}/reject`,
      payload: { reason: "Not needed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, decision: "rejected" });

    const decision = await promise;
    expect(decision.approved).toBe(false);
  });

  it("POST /api/consent/:id/approve returns 404 for unknown", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/consent/nonexistent/approve",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/consent/count returns pending count", async () => {
    consentManager.requestConsent({
      actionId: "act-4",
      toolName: "terminal.run",
      summary: "Run x",
      preview: {},
      risk: "medium",
      sessionId: "s1",
    });

    const res = await app.inject({ method: "GET", url: "/api/consent/count" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 1 });

    consentManager.cancelAll();
  });

  it("GET /api/trust/levels returns empty initially", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trust/levels" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { levels: unknown[] };
    expect(body.levels).toHaveLength(0);
  });

  it("GET /api/trust/levels/:actionType returns trust state", async () => {
    // Record some approvals
    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");

    const res = await app.inject({ method: "GET", url: "/api/trust/levels/terminal.run" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { currentLevel: number; approvedCount: number };
    expect(body.currentLevel).toBe(1);
    expect(body.approvedCount).toBe(3);
  });

  it("POST /api/trust/levels/:actionType/reset resets trust", async () => {
    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");

    const res = await app.inject({
      method: "POST",
      url: "/api/trust/levels/terminal.run/reset",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { currentLevel: number };
    expect(body.currentLevel).toBe(0);
  });
});
