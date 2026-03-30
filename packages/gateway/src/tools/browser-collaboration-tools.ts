import type { BrowserCollaborationService } from "../services/browser-collaboration.js";
import type { ToolDefinition, ToolResult } from "./contracts.js";

interface BrowserSessionListInput {}
interface BrowserSessionControlInput { browserSessionId: string }
interface BrowserInterventionRequestInput {
  browserSessionId: string;
  reason: string;
  instructions: string;
  kind?: "complete_login" | "enter_secret" | "dismiss_modal" | "confirm_external_prompt" | "custom";
  secretSafe?: boolean;
  allowUserNote?: boolean;
}
interface BrowserInterventionResolveInput {
  interventionId: string;
  userNote?: string;
}

function getScopedBrowserSessions(
  collaboration: BrowserCollaborationService,
  sessionId?: string | null,
  userId?: string | null,
) {
  const linkedPreview = sessionId?.trim()
    ? collaboration.getSessionByPreviewSessionId(sessionId.trim())
    : null;
  if (!linkedPreview) return collaboration.listSessions(userId);
  if (userId && linkedPreview.createdBy && linkedPreview.createdBy !== userId) return [];
  return [linkedPreview];
}

function resolveScopedBrowserSession(
  collaboration: BrowserCollaborationService,
  browserSessionId: string,
  sessionId?: string | null,
  userId?: string | null,
) {
  const sessions = getScopedBrowserSessions(collaboration, sessionId, userId);
  const session = sessions.find((item) => item.id === browserSessionId) ?? null;
  if (session) return session;
  if (sessionId?.trim()) {
    throw new Error("This chat session is locked to its visible preview browser session. Use that session only.");
  }
  return null;
}

export function createBrowserSessionListTool(
  collaboration?: BrowserCollaborationService,
): ToolDefinition<BrowserSessionListInput> {
  return {
    name: "browser.session.list",
    description: "List active collaborative browser sessions and their control state.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: { type: "object", properties: {} },
    async execute(_input, context): Promise<ToolResult> {
      if (!collaboration) return { ok: false, message: "Browser collaboration service is not available" };
      const sessions = getScopedBrowserSessions(collaboration, context.sessionId, context.userId);
      return {
        ok: true,
        message: sessions.length ? `Found ${sessions.length} browser session(s)` : "No collaborative browser sessions",
        data: { sessions },
      };
    },
  };
}

export function createBrowserSessionTakeControlTool(
  collaboration?: BrowserCollaborationService,
): ToolDefinition<BrowserSessionControlInput> {
  return {
    name: "browser.session.take_control",
    description: "Transfer a collaborative browser session to the user so the agent stops mutating it.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        browserSessionId: { type: "string", description: "Browser session ID" },
      },
      required: ["browserSessionId"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (!collaboration) return { ok: false, message: "Browser collaboration service is not available" };
      resolveScopedBrowserSession(collaboration, input.browserSessionId, context.sessionId, context.userId);
      const session = collaboration.takeControl(input.browserSessionId, context.userId);
      if (!session) return { ok: false, message: "Browser session not found" };
      return {
        ok: true,
        message: `Browser session ${session.name} is now controlled by the user`,
        data: { session },
      };
    },
  };
}

export function createBrowserSessionReturnControlTool(
  collaboration?: BrowserCollaborationService,
): ToolDefinition<BrowserSessionControlInput> {
  return {
    name: "browser.session.return_control",
    description: "Return control of a collaborative browser session to the agent.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        browserSessionId: { type: "string", description: "Browser session ID" },
      },
      required: ["browserSessionId"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (!collaboration) return { ok: false, message: "Browser collaboration service is not available" };
      resolveScopedBrowserSession(collaboration, input.browserSessionId, context.sessionId, context.userId);
      const session = collaboration.returnControl(input.browserSessionId, context.userId);
      if (!session) return { ok: false, message: "Browser session not found" };
      return {
        ok: true,
        message: `Browser session ${session.name} is now controlled by the agent`,
        data: { session },
      };
    },
  };
}

export function createBrowserInterventionRequestTool(
  collaboration?: BrowserCollaborationService,
): ToolDefinition<BrowserInterventionRequestInput> {
  return {
    name: "browser.intervention.request",
    description: "Pause browser work and request user intervention on a collaborative browser session.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        browserSessionId: { type: "string", description: "Browser session ID" },
        reason: { type: "string", description: "Short reason shown to the user" },
        instructions: { type: "string", description: "What the user should do before resuming" },
        kind: {
          type: "string",
          description: "Intervention type",
          enum: ["complete_login", "enter_secret", "dismiss_modal", "confirm_external_prompt", "custom"],
        },
        secretSafe: { type: "boolean", description: "Whether this intervention involves sensitive input" },
        allowUserNote: { type: "boolean", description: "Whether the user may add a note before resuming" },
      },
      required: ["browserSessionId", "reason", "instructions"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (!collaboration) return { ok: false, message: "Browser collaboration service is not available" };
      resolveScopedBrowserSession(collaboration, input.browserSessionId, context.sessionId, context.userId);
      const intervention = collaboration.requestIntervention({
        browserSessionId: input.browserSessionId,
        reason: input.reason,
        instructions: input.instructions,
        kind: input.kind,
        secretSafe: input.secretSafe,
        allowUserNote: input.allowUserNote,
        requestedBy: context.userId,
        chatSessionId: context.sessionId,
      });
      return {
        ok: true,
        message: `User intervention requested: ${intervention.reason}`,
        data: { intervention },
      };
    },
  };
}

export function createBrowserInterventionResolveTool(
  collaboration?: BrowserCollaborationService,
): ToolDefinition<BrowserInterventionResolveInput> {
  return {
    name: "browser.intervention.resolve",
    description: "Resolve a browser intervention and return control to the agent.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        interventionId: { type: "string", description: "Browser intervention ID" },
        userNote: { type: "string", description: "Optional note to append before resuming" },
      },
      required: ["interventionId"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (!collaboration) return { ok: false, message: "Browser collaboration service is not available" };
      const intervention = collaboration.resolveIntervention(input.interventionId, context.userId, input.userNote);
      if (!intervention) return { ok: false, message: "Browser intervention not found" };
      return {
        ok: true,
        message: "Browser intervention resolved",
        data: { intervention },
      };
    },
  };
}
