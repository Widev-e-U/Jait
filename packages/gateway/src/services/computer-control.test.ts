import { describe, expect, it } from "vitest";
import { ComputerControlSessionService } from "./computer-control.js";

describe("ComputerControlSessionService", () => {
  it("creates an owner-scoped lease and rejects cross-chat access", () => {
    const service = new ComputerControlSessionService(() => 1_000, 5_000);
    const session = service.start("chat-a", "windows-a");

    expect(session.nodeId).toBe("windows-a");
    expect(session.ownerSessionId).toBe("chat-a");
    expect(session.expiresAt).toBe(new Date(6_000).toISOString());
    expect(service.requireOwned(session.id, "chat-a")).toEqual(session);
    expect(() => service.requireOwned(session.id, "chat-b")).toThrow(/belongs to another chat/);
  });

  it("allows only one active controller per computer", () => {
    const service = new ComputerControlSessionService();
    service.start("chat-a", "windows-a");

    expect(() => service.start("chat-b", "windows-a")).toThrow(/already controlled by another chat/);
  });

  it("expires leases and permits a later session", () => {
    let now = 1_000;
    const service = new ComputerControlSessionService(() => now, 500);
    const first = service.start("chat-a", "windows-a");

    now = 1_501;
    expect(service.get(first.id)).toBeUndefined();
    expect(service.start("chat-b", "windows-a").ownerSessionId).toBe("chat-b");
  });
});
