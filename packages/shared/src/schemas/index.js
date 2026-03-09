import { z } from "zod";
import { SURFACE_TYPES } from "../types/surface.js";
// --- Surface schemas ---
export const surfaceTypeSchema = z.enum(SURFACE_TYPES);
export const surfaceCapabilitiesSchema = z.object({
    supportsStreaming: z.boolean(),
    supportsInput: z.boolean(),
    supportsSnapshot: z.boolean(),
    supportsRecording: z.boolean(),
    requiresConsent: z.boolean(),
    maxConcurrent: z.number().int().positive(),
});
export const surfaceInfoSchema = z.object({
    id: z.string(),
    type: surfaceTypeSchema,
    status: z.enum(["connected", "disconnected", "error"]),
    capabilities: surfaceCapabilitiesSchema,
    deviceId: z.string(),
    connectedAt: z.string().nullable(),
});
// --- Session schemas ---
export const sessionCreateSchema = z.object({
    name: z.string().max(200).optional(),
    workspacePath: z.string().optional(),
});
export const sessionInfoSchema = z.object({
    id: z.string(),
    name: z.string().nullable(),
    workspacePath: z.string().nullable(),
    status: z.enum(["active", "archived", "deleted"]),
    createdAt: z.string(),
    lastActiveAt: z.string(),
    metadata: z.string().nullable(),
});
// --- Action schemas ---
export const actionStatusSchema = z.enum([
    "pending",
    "approved",
    "executing",
    "executed",
    "completed",
    "failed",
    "reverted",
]);
export const actionResponseSchema = z.object({
    action_id: z.string(),
    status: actionStatusSchema,
    surface: z.string(),
    device_id: z.string().optional(),
    preview: z
        .object({
        command: z.string().optional(),
        description: z.string(),
        side_effects: z.array(z.string()),
    })
        .optional(),
    consent_url: z.string().url().optional(),
    expires_at: z.string().datetime().optional(),
});
// --- Message schemas ---
export const chatMessageSchema = z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system", "tool"]),
    content: z.string(),
    timestamp: z.string().datetime(),
    sessionId: z.string(),
});
export const sendMessageSchema = z.object({
    content: z.string().min(1).max(100_000),
    sessionId: z.string().uuid(),
});
// --- Gateway schemas ---
export const gatewayStatusSchema = z.object({
    version: z.string(),
    uptime: z.number(),
    sessions: z.number().int(),
    surfaces: z.number().int(),
    devices: z.number().int(),
    healthy: z.boolean(),
});
//# sourceMappingURL=index.js.map