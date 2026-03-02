import type { ScreenShareService } from "@jait/screen-share";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

interface ScreenShareInput {
  action: "start" | "stop" | "pause" | "resume";
  hostDeviceId?: string;
  viewerDeviceIds?: string[];
}

interface OsToolInput {
  action: "state" | "register-device" | "transfer-control" | "transport-update";
  device?: {
    id: string;
    name: string;
    platform: "electron" | "react-native" | "web";
    authorized?: boolean;
    capabilities?: string[];
  };
  controllerDeviceId?: string;
  transport?: {
    deviceId: string;
    latencyMs: number;
    preferP2P?: boolean;
  };
}

export function createScreenShareTool(screenShare: ScreenShareService): ToolDefinition<ScreenShareInput> {
  return {
    name: "screen.share",
    description: "Start/stop/pause/resume active screen sharing session.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "stop", "pause", "resume"] },
        hostDeviceId: { type: "string" },
        viewerDeviceIds: { type: "string", description: "Optional comma-separated viewer device IDs" },
      },
      required: ["action"],
    },
    async execute(input): Promise<ToolResult> {
      if (input.action === "start") {
        if (!input.hostDeviceId) return { ok: false, message: "hostDeviceId is required for start." };
        const state = screenShare.startShare({ hostDeviceId: input.hostDeviceId, viewerDeviceIds: input.viewerDeviceIds });
        return { ok: true, message: "Screen sharing started.", data: state };
      }
      if (input.action === "stop") {
        return { ok: true, message: "Screen sharing stopped.", data: screenShare.stopShare() };
      }

      const current = screenShare.getState().activeSession;
      if (!current) return { ok: false, message: "No active share session." };

      const nextStatus = input.action === "pause" ? "paused" : "sharing";
      const next = { ...current, status: nextStatus, updatedAt: new Date().toISOString() };
      // keep write path centralized by restarting from current config (simple state transition)
      if (nextStatus === "sharing" && current.status === "paused") {
        screenShare.updateViewerTransport({
          deviceId: current.viewers[0]?.deviceId ?? "",
          latencyMs: current.transport.avgLatencyMs,
          preferP2P: current.transport.routeMode === "p2p",
        });
      }

      return { ok: true, message: `Screen sharing ${input.action}d.`, data: next };
    },
  };
}

export function createScreenCaptureTool(screenShare: ScreenShareService): ToolDefinition<Record<string, never>> {
  return {
    name: "screen.capture",
    description: "Capture a point-in-time screenshot from active screen source.",
    parameters: { type: "object", properties: {} },
    async execute(): Promise<ToolResult> {
      return { ok: true, message: "Screen captured.", data: screenShare.captureScreen() };
    },
  };
}

export function createScreenRecordTool(screenShare: ScreenShareService): ToolDefinition<Record<string, never>> {
  return {
    name: "screen.record",
    description: "Start recording an active screen share session for audit/playback.",
    parameters: { type: "object", properties: {} },
    async execute(): Promise<ToolResult> {
      return { ok: true, message: "Screen recording started.", data: screenShare.startRecording() };
    },
  };
}

export function createOsTool(screenShare: ScreenShareService, name: "os.tool" | "os_tool"): ToolDefinition<OsToolInput> {
  return {
    name,
    description: "Distributed OS control plane for screen-share network state and control transfer.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["state", "register-device", "transfer-control", "transport-update"] },
      },
      required: ["action"],
    },
    async execute(input: OsToolInput, _context: ToolContext): Promise<ToolResult> {
      try {
        switch (input.action) {
          case "state":
            return { ok: true, message: "OS tool network state.", data: screenShare.getState() };
          case "register-device": {
            if (!input.device) return { ok: false, message: "device payload is required." };
            const device = screenShare.registerDevice({
              id: input.device.id,
              name: input.device.name,
              platform: input.device.platform,
              authorized: input.device.authorized ?? true,
              capabilities: input.device.capabilities ?? [],
            });
            return { ok: true, message: "Device registered.", data: device };
          }
          case "transfer-control": {
            if (!input.controllerDeviceId) return { ok: false, message: "controllerDeviceId is required." };
            const state = screenShare.transferControl(input.controllerDeviceId);
            return { ok: true, message: "Control transferred.", data: state };
          }
          case "transport-update": {
            if (!input.transport) return { ok: false, message: "transport payload is required." };
            const state = screenShare.updateViewerTransport({
              deviceId: input.transport.deviceId,
              latencyMs: input.transport.latencyMs,
              preferP2P: input.transport.preferP2P ?? true,
            });
            return { ok: true, message: "Transport updated.", data: state };
          }
          default:
            return { ok: false, message: `Unsupported os_tool action: ${String(input.action)}` };
        }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "OS tool action failed." };
      }
    },
  };
}
