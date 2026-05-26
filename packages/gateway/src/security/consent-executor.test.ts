import { describe, expect, it, vi } from "vitest";

import type { ToolContext, ToolDefinition, ToolResult } from "../tools/contracts.js";
import { ToolRegistry } from "../tools/registry.js";
import { ConsentAwareExecutor } from "./consent-executor.js";
import { ConsentManager } from "./consent-manager.js";
import { TrustEngine } from "./trust-engine.js";
import { getProfile } from "./tool-profiles.js";

const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};

const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;

function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}

function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}

describe("ConsentAwareExecutor consent-sensitive tools", () => {
  it.each(consentSensitiveTools)(
    "requires approval before executing $name",
    async (tool) => {
      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);

      expect(consentManager.pendingCount).toBe(1);
      expect(executions.get(tool.name)).not.toHaveBeenCalled();

      const request = consentManager.listPending()[0]!;
      expect(request.toolName).toBe(tool.name);
      expect(request.summary).toBe(tool.expectedSummary);
      expect(request.preview).toEqual(tool.expectedPreview);
      expect(request.risk).toBe(tool.expectedRisk);
      expect(request.policy).toMatchObject({
        consentLevel: tool.expectedConsentLevel,
        knownTool: true,
        source: "profile",
      });

      consentManager.approve(request.id, "click", "Approved for focused test");

      const result = await promise;
      expect(result.ok).toBe(true);
      expect(executions.get(tool.name)).toHaveBeenCalledOnce();
      expect(executions.get(tool.name)).toHaveBeenCalledWith(tool.input, expect.objectContaining({
        actionId: context.actionId,
        sessionId: context.sessionId,
      }));
    },
  );

  it.each(consentSensitiveTools)(
    "does not execute $name when consent is rejected",
    async (tool) => {
      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);
      const request = consentManager.listPending()[0]!;

      consentManager.reject(request.id, "click", "Not approved in this session");

      const result = await promise;
      expect(result.ok).toBe(false);
      expect(result.message).toBe(`User rejected ${tool.name}: Not approved in this session`);
      expect(result.data).toEqual({ consentRejected: true, decidedVia: "click" });
      expect(executions.get(tool.name)).not.toHaveBeenCalled();
      expect(consentManager.pendingCount).toBe(0);
    },
  );
});
