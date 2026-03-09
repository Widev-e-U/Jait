import type { ScreenShareService } from "@jait/screen-share";
import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition } from "./contracts.js";
interface ScreenShareInput {
    action: "connect" | "disconnect" | "list-devices" | "start";
    targetDeviceId?: string;
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
export declare function createScreenShareTool(screenShare: ScreenShareService, ws?: WsControlPlane): ToolDefinition<ScreenShareInput>;
export declare function createScreenCaptureTool(screenShare: ScreenShareService): ToolDefinition<Record<string, never>>;
export declare function createScreenRecordTool(screenShare: ScreenShareService): ToolDefinition<Record<string, never>>;
export declare function createOsTool(screenShare: ScreenShareService, name: "os.tool" | "os_tool"): ToolDefinition<OsToolInput>;
export {};
//# sourceMappingURL=screen-share-tools.d.ts.map