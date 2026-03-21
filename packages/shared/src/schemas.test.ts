import { describe, it, expect } from "vitest";
import {
  surfaceTypeSchema,
  surfaceInfoSchema,
  sessionCreateSchema,
  sessionInfoSchema,
  actionResponseSchema,
  chatMessageSchema,
  sendMessageSchema,
  gatewayStatusSchema,
} from "./schemas/index.js";
import { ERROR_CODES, VERSION } from "./constants/index.js";

describe("@jait/shared schemas", () => {
  describe("surfaceTypeSchema", () => {
    it("accepts valid surface types", () => {
      expect(surfaceTypeSchema.parse("terminal")).toBe("terminal");
      expect(surfaceTypeSchema.parse("browser")).toBe("browser");
      expect(surfaceTypeSchema.parse("file-system")).toBe("file-system");
    });

    it("rejects invalid surface types", () => {
      expect(() => surfaceTypeSchema.parse("invalid")).toThrow();
      expect(() => surfaceTypeSchema.parse(42)).toThrow();
    });
  });

  describe("surfaceInfoSchema", () => {
    it("accepts valid surface info", () => {
      const result = surfaceInfoSchema.parse({
        id: "surf-1",
        type: "terminal",
        status: "connected",
        capabilities: {
          supportsStreaming: true,
          supportsInput: true,
          supportsSnapshot: false,
          supportsRecording: false,
          requiresConsent: false,
          maxConcurrent: 5,
        },
        deviceId: "dev-1",
        connectedAt: null,
      });
      expect(result.id).toBe("surf-1");
      expect(result.status).toBe("connected");
    });

    it("rejects invalid status", () => {
      expect(() =>
        surfaceInfoSchema.parse({
          id: "s1",
          type: "terminal",
          status: "unknown",
          capabilities: {
            supportsStreaming: true,
            supportsInput: true,
            supportsSnapshot: false,
            supportsRecording: false,
            requiresConsent: false,
            maxConcurrent: 1,
          },
          deviceId: "d1",
          connectedAt: null,
        }),
      ).toThrow();
    });
  });

  describe("sessionCreateSchema", () => {
    it("accepts valid session creation", () => {
      const result = sessionCreateSchema.parse({
        workspaceId: "workspace-1",
        name: "My session",
        workspacePath: "/home/user/project",
      });
      expect(result.name).toBe("My session");
    });

    it("accepts empty params (all optional)", () => {
      const result = sessionCreateSchema.parse({});
      expect(result.name).toBeUndefined();
    });

    it("rejects name over 200 chars", () => {
      expect(() =>
        sessionCreateSchema.parse({
          name: "x".repeat(201),
        }),
      ).toThrow();
    });
  });

  describe("sessionInfoSchema", () => {
    it("accepts valid session info", () => {
      const result = sessionInfoSchema.parse({
        id: "01912345-6789-7abc-8def-0123456789ab",
        workspaceId: "workspace-1",
        name: "Test session",
        workspacePath: "/home/user/project",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastActiveAt: "2026-01-01T00:05:00.000Z",
        metadata: null,
      });
      expect(result.status).toBe("active");
    });

    it("accepts archived/deleted statuses", () => {
      for (const status of ["archived", "deleted"] as const) {
        const result = sessionInfoSchema.parse({
          id: "test-id",
          workspaceId: null,
          name: null,
          workspacePath: null,
          status,
          createdAt: "2026-01-01T00:00:00.000Z",
          lastActiveAt: "2026-01-01T00:00:00.000Z",
          metadata: null,
        });
        expect(result.status).toBe(status);
      }
    });
  });

  describe("actionResponseSchema", () => {
    it("accepts minimal action response", () => {
      const result = actionResponseSchema.parse({
        action_id: "act-123",
        status: "completed",
        surface: "terminal",
      });
      expect(result.action_id).toBe("act-123");
    });

    it("accepts full action response with preview", () => {
      const result = actionResponseSchema.parse({
        action_id: "act-456",
        status: "pending",
        surface: "file_system",
        device_id: "dev-1",
        preview: {
          command: "rm -rf /tmp/old",
          description: "Delete old temp files",
          side_effects: ["file_deletion"],
        },
        consent_url: "https://example.com/consent/123",
        expires_at: "2026-01-01T01:00:00Z",
      });
      expect(result.preview?.description).toBe("Delete old temp files");
    });

    it("rejects invalid action status", () => {
      expect(() =>
        actionResponseSchema.parse({
          action_id: "act-789",
          status: "unknown_status",
          surface: "terminal",
        }),
      ).toThrow();
    });
  });

  describe("chatMessageSchema", () => {
    it("accepts valid chat message", () => {
      const result = chatMessageSchema.parse({
        id: "msg-1",
        role: "user",
        content: "Hello world",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "sess-1",
      });
      expect(result.role).toBe("user");
    });

    it("accepts all valid roles", () => {
      for (const role of ["user", "assistant", "system", "tool"]) {
        const result = chatMessageSchema.parse({
          id: `msg-${role}`,
          role,
          content: "test",
          timestamp: "2026-01-01T00:00:00Z",
          sessionId: "s1",
        });
        expect(result.role).toBe(role);
      }
    });
  });

  describe("sendMessageSchema", () => {
    it("accepts valid message", () => {
      const result = sendMessageSchema.parse({
        content: "Hello",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.content).toBe("Hello");
    });

    it("rejects empty content", () => {
      expect(() =>
        sendMessageSchema.parse({
          content: "",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      ).toThrow();
    });
  });

  describe("gatewayStatusSchema", () => {
    it("accepts valid status", () => {
      const result = gatewayStatusSchema.parse({
        version: "0.1.0",
        uptime: 120,
        sessions: 3,
        surfaces: 2,
        devices: 1,
        healthy: true,
      });
      expect(result.healthy).toBe(true);
    });
  });

  describe("constants", () => {
    it("exports VERSION", () => {
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("exports ERROR_CODES with expected keys", () => {
      expect(ERROR_CODES.UNAUTHORIZED).toBe("UNAUTHORIZED");
      expect(ERROR_CODES.SESSION_NOT_FOUND).toBe("SESSION_NOT_FOUND");
      expect(ERROR_CODES.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
      expect(ERROR_CODES.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
      expect(ERROR_CODES.TOOL_NOT_FOUND).toBe("TOOL_NOT_FOUND");
      expect(ERROR_CODES.CONSENT_TIMEOUT).toBe("CONSENT_TIMEOUT");
    });
  });
});
