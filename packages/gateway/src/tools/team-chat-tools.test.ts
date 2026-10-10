import { describe, expect, it, vi } from "vitest";
import type { TeamChatService } from "../services/team-chat.js";
import type { SessionService } from "../services/sessions.js";
import { createTeamChatTool } from "./team-chat-tools.js";
const context = { sessionId: "team-tests", actionId: "team-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
function fixture() {
  const room = { id: "room-1", rootAgentId: "manager-1", name: "Developer team" };
  const sender = { kind: "chat", sourceSessionId: context.sessionId };
  const service = {
    list: vi.fn().mockReturnValue([room]), workForSession: vi.fn().mockReturnValue(null),
    ensureRoom: vi.fn().mockReturnValue(room), get: vi.fn().mockReturnValue(room),
    members: vi.fn().mockReturnValue([{ id: "reviewer-1" }]), history: vi.fn().mockReturnValue([]),
    deliveries: vi.fn().mockReturnValue([{ messageId: "message-1", recipientId: "reviewer-1" }]),
    sender: vi.fn().mockReturnValue(sender), setGoal: vi.fn().mockReturnValue(room),
    completeGoal: vi.fn().mockReturnValue(room),
    postRouted: vi.fn().mockResolvedValue({ id: "message-1" }), threadById: vi.fn().mockReturnValue(null),
  };
  const tool = createTeamChatTool(service as unknown as TeamChatService, {} as SessionService);
  return { service, tool, room, sender };
}
describe("team.chat", () => {
  it("requires authentication before accessing a room", async () => {
    const f = fixture();
    expect((await f.tool.execute({ action: "list" }, { ...context, userId: undefined })).ok).toBe(false);
    expect(f.service.list).not.toHaveBeenCalled();
  });
  it("lists rooms belonging to the caller", async () => {
    const f = fixture();
    expect(await f.tool.execute({ action: "list" }, context)).toMatchObject({ ok: true, data: { rooms: [f.room] } });
    expect(f.service.list).toHaveBeenCalledWith("owner-1");
  });
  it("gets members, messages and deliveries from the selected room", async () => {
    const f = fixture();
    expect(await f.tool.execute({ action: "get", roomId: "room-1" }, context)).toMatchObject({ ok: true, data: { room: f.room, members: [{ id: "reviewer-1" }], messages: [] } });
    expect(f.service.get).toHaveBeenCalledWith("owner-1", "room-1");
    expect(f.service.history).toHaveBeenCalledWith("owner-1", "room-1");
  });
  it("relays from a normal chat with attribution, addressed recipients and a stable retry key", async () => {
    const f = fixture();
    expect((await f.tool.execute({ action: "send", roomId: "room-1", content: "Review the test results", recipientIds: ["reviewer-1"], kind: "assignment" }, context)).ok).toBe(true);
    expect(f.service.postRouted).toHaveBeenCalledWith("owner-1", "room-1", expect.objectContaining({
      content: "Review the test results", sender: f.sender, kind: "relay",
      recipientIds: ["reviewer-1"], clientKey: "team-action",
    }));
  });
  it("rejects an empty message without creating a delivery", async () => {
    const f = fixture();
    expect((await f.tool.execute({ action: "send", roomId: "room-1", content: " " }, context)).ok).toBe(false);
    expect(f.service.postRouted).not.toHaveBeenCalled();
  });
  it("records goal criteria through the service", async () => {
    const f = fixture();
    expect((await f.tool.execute({ action: "goal", roomId: "room-1", content: "Verify tools", criteria: ["Browser passes"] }, context)).ok).toBe(true);
    expect(f.service.setGoal).toHaveBeenCalledWith("owner-1", "room-1", "Verify tools", ["Browser passes"], f.sender);
  });
  it("requires service verification before reporting a goal complete", async () => {
    const f = fixture();
    f.service.completeGoal.mockImplementation(() => { throw new Error("Independent verification required"); });
    expect(await f.tool.execute({ action: "complete", roomId: "room-1", evidence: ["Browser checks passed"] }, context)).toEqual({ ok: false, message: "Independent verification required" });
  });
  it("returns verified completion with its evidence", async () => {
    const f = fixture();
    expect((await f.tool.execute({ action: "complete", roomId: "room-1", evidence: ["Browser checks passed"] }, context)).ok).toBe(true);
    expect(f.service.completeGoal).toHaveBeenCalledWith("owner-1", "room-1", ["Browser checks passed"], f.sender);
  });
  it("reports inaccessible rooms without sending a message", async () => {
    const f = fixture();
    f.service.get.mockImplementation(() => { throw new Error("Room not found"); });
    expect(await f.tool.execute({ action: "get", roomId: "foreign-room" }, context)).toEqual({ ok: false, message: "Room not found" });
    expect(f.service.postRouted).not.toHaveBeenCalled();
  });
});
