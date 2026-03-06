import type { ScreenShareService } from "@jait/screen-share";
import type { WsControlPlane } from "../ws.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

interface ScreenShareInput {
  action: "connect" | "disconnect" | "list-devices";
  targetDeviceId?: string;
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

export function createScreenShareTool(screenShare: ScreenShareService, ws?: WsControlPlane): ToolDefinition<ScreenShareInput> {
  return {
    name: "screen.share",
    description:
      "Connect to a remote device and view its screen, or manage remote screen viewing sessions. " +
      "Use 'list-devices' to discover connected devices (desktop Electron app, mobile, browser). " +
      "Use 'connect' with a targetDeviceId to view that device's screen remotely. " +
      "Use 'disconnect' to end the current viewing session.",
    tier: "standard",
    category: "screen",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["connect", "disconnect", "list-devices"],
          description: "Action to perform. Use 'list-devices' to discover devices, 'connect' to view a remote screen, 'disconnect' to stop.",
        },
        targetDeviceId: {
          type: "string",
          description: "Device ID to connect to and view its screen. Required for 'connect'.",
        },
      },
      required: ["action"],
    },
    async execute(input): Promise<ToolResult> {
      if (input.action === "list-devices") {
        const state = screenShare.getState();
        return {
          ok: true,
          message: `Found ${state.devices.length} registered device(s). Active session: ${state.activeSession ? state.activeSession.status : "none"}.`,
          data: {
            devices: state.devices.map((d) => ({
              id: d.id,
              name: d.name,
              platform: d.platform,
              authorized: d.authorized,
              capabilities: d.capabilities,
              lastSeenAt: d.lastSeenAt,
            })),
            activeSession: state.activeSession
              ? { id: state.activeSession.id, status: state.activeSession.status, hostDeviceId: state.activeSession.hostDeviceId }
              : null,
          },
        };
      }

      if (input.action === "connect") {
        if (!input.targetDeviceId) {
          const devices = screenShare.getState().devices;
          if (devices.length === 0) {
            return {
              ok: false,
              message: "No devices registered. The user needs to open Jait on the target device (desktop app, mobile app, or browser) first. Each device auto-registers when it opens.",
            };
          }
          return {
            ok: false,
            message: `targetDeviceId is required. Available devices: ${devices.map((d) => `${d.name} (${d.id})`).join(", ")}`,
          };
        }
        // Start a session with the target device as the host (screen sharer)
        // The viewer (user's current browser) will be added automatically
        const state = screenShare.startShare({ hostDeviceId: input.targetDeviceId });

        // Tell the host device to begin screen capture via WS
        if (ws) {
          ws.sendScreenShareStartRequest(state.id, input.targetDeviceId);
          ws.broadcastScreenShareState(state);
        }

        return {
          ok: true,
          message: `Connecting to remote device "${input.targetDeviceId}". The remote device will start sharing its screen. The user can now see the remote screen in the Screen Share panel.`,
          data: state,
        };
      }

      if (input.action === "disconnect") {
        return { ok: true, message: "Screen viewing session ended.", data: screenShare.stopShare() };
      }

      return { ok: false, message: `Unknown action: ${String(input.action)}` };
    },
  };
}

export function createScreenCaptureTool(screenShare: ScreenShareService): ToolDefinition<Record<string, never>> {
  return {
    name: "screen.capture",
    description: "Capture a point-in-time screenshot from active screen source.",
    tier: "standard",
    category: "screen",
    source: "builtin",
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
    tier: "standard",
    category: "screen",
    source: "builtin",
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
    tier: "standard",
    category: "screen",
    source: "builtin",
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
