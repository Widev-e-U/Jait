import type {
  ComputerControlSession,
  ComputerTarget,
  NodeState,
} from "@jait/shared";
import { ComputerControlSessionService } from "../services/computer-control.js";
import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition, ToolResult } from "./contracts.js";

interface ComputerSessionInput {
  action: "start" | "stop" | "status";
  nodeId?: string;
  sessionId?: string;
}

interface ComputerObserveInput {
  sessionId: string;
}

interface ComputerActInput {
  sessionId: string;
  action: "move" | "click" | "type" | "key" | "scroll";
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle";
  clicks?: number;
  text?: string;
  combo?: string;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  includeScreenshot?: boolean;
  waitAfterMs?: number;
}

const COMPUTER_NODE_TOOLS = ["computer.session", "computer.observe", "computer.act"] as const;

function targetFromNode(node: NodeState): ComputerTarget | null {
  if (node.role !== "desktop" || node.lifecycle !== "ready") return null;
  if (node.platform !== "windows") {
    return {
      nodeId: node.id,
      name: node.name,
      platform: node.platform,
      available: false,
      reason: "Computer control is currently available on Windows desktop nodes only",
    };
  }
  const missingTool = COMPUTER_NODE_TOOLS.find((tool) => !node.capabilities.tools.includes(tool));
  return {
    nodeId: node.id,
    name: node.name,
    platform: node.platform,
    available: !missingTool,
    ...(missingTool ? { reason: `Desktop update required (${missingTool} is unavailable)` } : {}),
  };
}

function availableTargets(ws: WsControlPlane): ComputerTarget[] {
  return ws.getNodeRegistry().nodes
    .map(targetFromNode)
    .filter((target): target is ComputerTarget => target !== null);
}

function selectTarget(ws: WsControlPlane, nodeId?: string): ComputerTarget {
  const targets = availableTargets(ws);
  if (nodeId) {
    const target = targets.find((candidate) => candidate.nodeId === nodeId);
    if (!target) throw new Error(`Computer target ${nodeId} is not connected`);
    if (!target.available) throw new Error(target.reason ?? `Computer target ${nodeId} is unavailable`);
    return target;
  }
  const candidates = targets.filter((target) => target.available);
  if (candidates.length === 0) throw new Error("No controllable Windows desktop is connected");
  if (candidates.length > 1) {
    throw new Error(`More than one computer is available; choose nodeId: ${candidates.map((target) => target.nodeId).join(", ")}`);
  }
  return candidates[0]!;
}

function asRemoteToolResult(value: unknown, fallbackMessage: string): ToolResult {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.ok === "boolean" && typeof record.message === "string") {
      return { ok: record.ok, message: record.message, ...(record.data === undefined ? {} : { data: record.data }) };
    }
  }
  return { ok: true, message: fallbackMessage, data: value };
}

function failure(error: unknown): ToolResult {
  return { ok: false, message: error instanceof Error ? error.message : String(error) };
}

function validateActInput(input: ComputerActInput): string | null {
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if ((input.action === "move" || input.action === "click") && (!finite(input.x) || !finite(input.y))) {
    return `${input.action} requires finite x and y coordinates`;
  }
  if (input.action === "click" && input.clicks !== undefined && (!Number.isInteger(input.clicks) || input.clicks < 1 || input.clicks > 3)) {
    return "clicks must be an integer from 1 to 3";
  }
  if (input.action === "type" && (typeof input.text !== "string" || input.text.length === 0)) {
    return "type requires non-empty text";
  }
  if (input.action === "key" && (typeof input.combo !== "string" || input.combo.trim().length === 0)) {
    return "key requires a key combo such as win+r or ctrl+l";
  }
  if (input.action === "scroll" && !input.direction) return "scroll requires a direction";
  if (input.amount !== undefined && (!finite(input.amount) || input.amount <= 0)) return "amount must be a positive number";
  if (input.waitAfterMs !== undefined && (!finite(input.waitAfterMs) || input.waitAfterMs < 0 || input.waitAfterMs > 10_000)) {
    return "waitAfterMs must be between 0 and 10000";
  }
  return null;
}

export function createComputerTools(
  ws: WsControlPlane,
  sessions = new ComputerControlSessionService(),
): ToolDefinition[] {
  const targetsTool: ToolDefinition<Record<string, never>> = {
    name: "computer.targets",
    displayName: "List Computers",
    description: "List connected desktop computers that support visible, user-approved mouse and keyboard control.",
    tier: "standard",
    category: "screen",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    discovery: {
      aliases: ["desktop control", "remote computer", "windows pc", "computer use"],
      capabilities: ["discover controllable Windows PCs", "list desktop control targets"],
      examples: ["Which computers can you control?", "Use my Windows PC"],
      priority: 20,
    },
    parameters: { type: "object", properties: {} },
    async execute(): Promise<ToolResult> {
      const targets = availableTargets(ws);
      return {
        ok: true,
        message: targets.length === 0
          ? "No desktop computers are connected."
          : targets.map((target) => `${target.name} (${target.nodeId}): ${target.available ? "available" : target.reason}`).join("\n"),
        data: { targets },
      };
    },
  };

  const sessionTool: ToolDefinition<ComputerSessionInput> = {
    name: "computer.session",
    displayName: "Computer Control Session",
    description: "Start, inspect, or stop a time-limited control session on a Windows desktop. Starting requires approval on both the gateway and target PC; Ctrl+Alt+Escape stops it locally.",
    tier: "standard",
    category: "screen",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "once",
    discovery: {
      aliases: ["computer use", "remote desktop input", "control pc"],
      capabilities: ["start visible Windows computer control", "stop computer control"],
      examples: ["Take control of my Windows desktop", "Stop controlling my computer"],
      priority: 30,
    },
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "stop", "status"] },
        nodeId: { type: "string", description: "Target node ID. Optional only when exactly one target is available." },
        sessionId: { type: "string", description: "Control session ID, required for stop and optional for status." },
      },
      required: ["action"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (input.action === "status") {
        try {
          const active = input.sessionId
            ? [sessions.requireOwned(input.sessionId, context.sessionId)]
            : sessions.listForOwner(context.sessionId);
          return {
            ok: true,
            message: active.length ? `${active.length} active computer session(s).` : "No active computer session.",
            data: { sessions: active },
          };
        } catch (error) {
          return failure(error);
        }
      }

      if (input.action === "start") {
        let session: ComputerControlSession | undefined;
        try {
          const target = selectTarget(ws, input.nodeId);
          session = sessions.start(context.sessionId, target.nodeId);
          const remote = asRemoteToolResult(await ws.proxyToolOp(
            target.nodeId,
            "computer.session",
            { action: "start", sessionId: session.id, expiresAt: session.expiresAt },
            { sessionId: context.sessionId, timeoutMs: 180_000 },
          ), "Computer control started.");
          if (!remote.ok) {
            sessions.stop(session.id);
            return remote;
          }
          return {
            ok: true,
            message: `Computer control started on ${target.name}. A visible Jait cursor is active; Ctrl+Alt+Escape stops it locally.`,
            data: { session, remote: remote.data },
          };
        } catch (error) {
          if (session) sessions.stop(session.id);
          return failure(error);
        }
      }

      if (!input.sessionId) return { ok: false, message: "sessionId is required to stop computer control" };
      let session: ComputerControlSession;
      try {
        session = sessions.requireOwned(input.sessionId, context.sessionId);
      } catch (error) {
        return failure(error);
      }
      try {
        const remote = asRemoteToolResult(await ws.proxyToolOp(
          session.nodeId,
          "computer.session",
          { action: "stop", sessionId: session.id },
          { sessionId: context.sessionId, timeoutMs: 30_000 },
        ), "Computer control stopped.");
        return remote.ok ? { ok: true, message: "Computer control stopped.", data: remote.data } : remote;
      } catch (error) {
        return failure(error);
      } finally {
        sessions.stop(session.id);
      }
    },
  };

  const observeTool: ToolDefinition<ComputerObserveInput> = {
    name: "computer.observe",
    displayName: "Observe Computer",
    description: "Capture the current Windows desktop during an active, user-approved computer control session.",
    tier: "standard",
    category: "screen",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    discovery: {
      aliases: ["computer screenshot", "see desktop", "observe screen"],
      capabilities: ["inspect the current Windows desktop"],
      examples: ["What is on my PC screen?"],
      priority: 25,
    },
    parameters: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        const session = sessions.requireOwned(input.sessionId, context.sessionId);
        return asRemoteToolResult(await ws.proxyToolOp(
          session.nodeId,
          "computer.observe",
          { sessionId: session.id },
          { sessionId: context.sessionId, timeoutMs: 60_000 },
        ), "Desktop captured.");
      } catch (error) {
        return failure(error);
      }
    },
  };

  const actTool: ToolDefinition<ComputerActInput> = {
    name: "computer.act",
    displayName: "Control Computer",
    description: "Move or click the pointer, type text, press a key combination, or scroll on a Windows desktop during an active control session.",
    tier: "standard",
    category: "screen",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "none",
    discovery: {
      aliases: ["mouse click", "keyboard input", "type on pc", "computer action"],
      capabilities: ["control Windows mouse and keyboard", "type into desktop applications"],
      examples: ["Open Notepad and type hello", "Click the Save button on my PC"],
      priority: 30,
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        action: { type: "string", enum: ["move", "click", "type", "key", "scroll"] },
        x: { type: "number", description: "Virtual desktop X coordinate for move/click." },
        y: { type: "number", description: "Virtual desktop Y coordinate for move/click." },
        button: { type: "string", enum: ["left", "right", "middle"] },
        clicks: { type: "number", description: "Click count from 1 to 3." },
        text: { type: "string", description: "Literal text for the type action." },
        combo: { type: "string", description: "Key combination such as win+r, ctrl+l, or enter." },
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        amount: { type: "number", description: "Positive scroll amount in wheel detents." },
        includeScreenshot: { type: "boolean", description: "Return a screenshot after the action. Defaults to true." },
        waitAfterMs: { type: "number", description: "Wait up to 10 seconds before capturing the result." },
      },
      required: ["sessionId", "action"],
    },
    async execute(input, context): Promise<ToolResult> {
      const validationError = validateActInput(input);
      if (validationError) return { ok: false, message: validationError };
      try {
        const session = sessions.requireOwned(input.sessionId, context.sessionId);
        return asRemoteToolResult(await ws.proxyToolOp(
          session.nodeId,
          "computer.act",
          input as unknown as Record<string, unknown>,
          { sessionId: context.sessionId, timeoutMs: 60_000 },
        ), `Computer action ${input.action} completed.`);
      } catch (error) {
        return failure(error);
      }
    },
  };

  return [targetsTool, sessionTool, observeTool, actTool];
}
