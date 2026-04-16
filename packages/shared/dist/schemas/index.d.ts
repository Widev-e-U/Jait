import { z } from "zod";
export declare const surfaceTypeSchema: z.ZodEnum<["terminal", "browser", "screen-share", "screen-capture", "voice", "file-system", "os-control", "clipboard", "notification"]>;
export declare const surfaceCapabilitiesSchema: z.ZodObject<{
    supportsStreaming: z.ZodBoolean;
    supportsInput: z.ZodBoolean;
    supportsSnapshot: z.ZodBoolean;
    supportsRecording: z.ZodBoolean;
    requiresConsent: z.ZodBoolean;
    maxConcurrent: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    supportsStreaming: boolean;
    supportsInput: boolean;
    supportsSnapshot: boolean;
    supportsRecording: boolean;
    requiresConsent: boolean;
    maxConcurrent: number;
}, {
    supportsStreaming: boolean;
    supportsInput: boolean;
    supportsSnapshot: boolean;
    supportsRecording: boolean;
    requiresConsent: boolean;
    maxConcurrent: number;
}>;
export declare const surfaceInfoSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["terminal", "browser", "screen-share", "screen-capture", "voice", "file-system", "os-control", "clipboard", "notification"]>;
    status: z.ZodEnum<["connected", "disconnected", "error"]>;
    capabilities: z.ZodObject<{
        supportsStreaming: z.ZodBoolean;
        supportsInput: z.ZodBoolean;
        supportsSnapshot: z.ZodBoolean;
        supportsRecording: z.ZodBoolean;
        requiresConsent: z.ZodBoolean;
        maxConcurrent: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        supportsStreaming: boolean;
        supportsInput: boolean;
        supportsSnapshot: boolean;
        supportsRecording: boolean;
        requiresConsent: boolean;
        maxConcurrent: number;
    }, {
        supportsStreaming: boolean;
        supportsInput: boolean;
        supportsSnapshot: boolean;
        supportsRecording: boolean;
        requiresConsent: boolean;
        maxConcurrent: number;
    }>;
    deviceId: z.ZodString;
    connectedAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "connected" | "disconnected" | "error";
    type: "terminal" | "browser" | "screen-share" | "screen-capture" | "voice" | "file-system" | "os-control" | "clipboard" | "notification";
    id: string;
    capabilities: {
        supportsStreaming: boolean;
        supportsInput: boolean;
        supportsSnapshot: boolean;
        supportsRecording: boolean;
        requiresConsent: boolean;
        maxConcurrent: number;
    };
    deviceId: string;
    connectedAt: string | null;
}, {
    status: "connected" | "disconnected" | "error";
    type: "terminal" | "browser" | "screen-share" | "screen-capture" | "voice" | "file-system" | "os-control" | "clipboard" | "notification";
    id: string;
    capabilities: {
        supportsStreaming: boolean;
        supportsInput: boolean;
        supportsSnapshot: boolean;
        supportsRecording: boolean;
        requiresConsent: boolean;
        maxConcurrent: number;
    };
    deviceId: string;
    connectedAt: string | null;
}>;
export declare const sessionCreateSchema: z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    workspacePath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    workspaceId?: string | undefined;
    name?: string | undefined;
    workspacePath?: string | undefined;
}, {
    workspaceId?: string | undefined;
    name?: string | undefined;
    workspacePath?: string | undefined;
}>;
export declare const sessionInfoSchema: z.ZodObject<{
    id: z.ZodString;
    workspaceId: z.ZodNullable<z.ZodString>;
    name: z.ZodNullable<z.ZodString>;
    workspacePath: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["active", "archived", "deleted"]>;
    createdAt: z.ZodString;
    lastActiveAt: z.ZodString;
    metadata: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "archived" | "deleted";
    id: string;
    workspaceId: string | null;
    name: string | null;
    workspacePath: string | null;
    createdAt: string;
    lastActiveAt: string;
    metadata: string | null;
}, {
    status: "active" | "archived" | "deleted";
    id: string;
    workspaceId: string | null;
    name: string | null;
    workspacePath: string | null;
    createdAt: string;
    lastActiveAt: string;
    metadata: string | null;
}>;
export declare const actionStatusSchema: z.ZodEnum<["pending", "approved", "executing", "executed", "completed", "failed", "reverted"]>;
export declare const actionResponseSchema: z.ZodObject<{
    action_id: z.ZodString;
    status: z.ZodEnum<["pending", "approved", "executing", "executed", "completed", "failed", "reverted"]>;
    surface: z.ZodString;
    device_id: z.ZodOptional<z.ZodString>;
    preview: z.ZodOptional<z.ZodObject<{
        command: z.ZodOptional<z.ZodString>;
        description: z.ZodString;
        side_effects: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        description: string;
        side_effects: string[];
        command?: string | undefined;
    }, {
        description: string;
        side_effects: string[];
        command?: string | undefined;
    }>>;
    consent_url: z.ZodOptional<z.ZodString>;
    expires_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "approved" | "executing" | "executed" | "completed" | "failed" | "reverted";
    action_id: string;
    surface: string;
    device_id?: string | undefined;
    preview?: {
        description: string;
        side_effects: string[];
        command?: string | undefined;
    } | undefined;
    consent_url?: string | undefined;
    expires_at?: string | undefined;
}, {
    status: "pending" | "approved" | "executing" | "executed" | "completed" | "failed" | "reverted";
    action_id: string;
    surface: string;
    device_id?: string | undefined;
    preview?: {
        description: string;
        side_effects: string[];
        command?: string | undefined;
    } | undefined;
    consent_url?: string | undefined;
    expires_at?: string | undefined;
}>;
export declare const chatMessageSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodEnum<["user", "assistant", "system", "tool"]>;
    content: z.ZodString;
    timestamp: z.ZodString;
    sessionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: string;
    sessionId: string;
}, {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: string;
    sessionId: string;
}>;
export declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
    sessionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    sessionId: string;
}, {
    content: string;
    sessionId: string;
}>;
export declare const gatewayStatusSchema: z.ZodObject<{
    version: z.ZodString;
    uptime: z.ZodNumber;
    sessions: z.ZodNumber;
    surfaces: z.ZodNumber;
    devices: z.ZodNumber;
    healthy: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    version: string;
    uptime: number;
    sessions: number;
    surfaces: number;
    devices: number;
    healthy: boolean;
}, {
    version: string;
    uptime: number;
    sessions: number;
    surfaces: number;
    devices: number;
    healthy: boolean;
}>;
//# sourceMappingURL=index.d.ts.map