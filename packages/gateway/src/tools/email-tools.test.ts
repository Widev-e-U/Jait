import { describe, expect, it, vi } from "vitest";
import type { EmailService } from "../services/email/index.js";
import type { WsControlPlane } from "../ws.js";
import { createEmailTools } from "./email-tools.js";
const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
describe.each(cases)("$name", ({ name, method, input, args, output }) => {
  it("acts within the caller's account and returns a meaningful result", async () => {
    const service = { [method]: vi.fn().mockResolvedValue(output) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    const result = await tool.execute(input, context);
    expect(result.ok).toBe(true);
    expect(service[method]).toHaveBeenCalledWith(...args);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    if (name === "email_read") expect(result.data).toMatchObject({ body: "Review the asset inventory ." });
    if (["email_send", "email_tag", "email_delete"].includes(name)) {
      expect(ws.sendUICommand).toHaveBeenCalledWith({ command: "email.control", data: { action: "refresh", accountId: "account-1" } }, context.sessionId);
    } else {
      expect(ws.sendUICommand).not.toHaveBeenCalled();
    }
  });
  it("reports provider failure and does not refresh the page as if successful", async () => {
    const service = { [method]: vi.fn().mockRejectedValue(new Error("Mailbox disconnected")) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    expect(await tool.execute(input, context)).toEqual({ ok: false, message: "Mailbox disconnected" });
    expect(ws.sendUICommand).not.toHaveBeenCalled();
  });
});
describe("email_view", () => {
  it("opens a draft in the caller's UI without sending a message", async () => {
    const service = { sendMessage: vi.fn() };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === "email_view")!;
    expect((await tool.execute({ action: "compose", to: "reviewer@example.test", body: "Draft for review" }, context)).ok).toBe(true);
    expect(ws.sendUICommand).toHaveBeenCalledWith(expect.objectContaining({
      command: "email.control", data: expect.objectContaining({ action: "compose", to: "reviewer@example.test", body: "Draft for review" }),
    }), context.sessionId);
    expect(service.sendMessage).not.toHaveBeenCalled();
  });
});
