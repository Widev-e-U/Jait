import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImapMailboxClient, parseImapMessageId } from "./imap.js";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

const state = vi.hoisted(() => ({
  client: { mailbox: { path: "INBOX", uidValidity: 7n, exists: 2 }, on: vi.fn(), connect: vi.fn(), close: vi.fn(),
    getMailboxLock: vi.fn(), fetchOne: vi.fn(), fetchAll: vi.fn(), search: vi.fn(),
    messageFlagsAdd: vi.fn(), messageFlagsRemove: vi.fn(), list: vi.fn(), messageMove: vi.fn() },
  transport: { sendMail: vi.fn(), verify: vi.fn(), close: vi.fn() },
}));
vi.mock("imapflow", () => ({ ImapFlow: vi.fn(function () { return state.client; }) }));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => state.transport) } }));
vi.mock("./connection.js", () => ({ publicMailServer: vi.fn(async config => ({ ...config, host: "1.1.1.1", servername: config.host })) }));
const config = { email: "me@example.com", displayName: "Me", imap: { host: "imap.example.com", port: 993, secure: true, user: "me", password: "test-password" }, smtp: { host: "smtp.example.com", port: 587, secure: false, user: "me", password: "test-password" } };
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const id = encoded(["INBOX", "7", 42]);
beforeEach(() => {
  vi.clearAllMocks();
  state.client.mailbox = { path: "INBOX", uidValidity: 7n, exists: 2 };
  state.client.getMailboxLock.mockResolvedValue({ release: vi.fn() });
  state.client.connect.mockResolvedValue(undefined);
  state.transport.sendMail.mockResolvedValue({ messageId: "sent-id" });
});
describe("IMAP/SMTP adapter", () => {
  it("connects only to pinned IPs with TLS validation and requires SMTP STARTTLS", async () => {
    await new ImapMailboxClient(config).verify();
    expect(ImapFlow).toHaveBeenCalledWith(expect.objectContaining({ host: "1.1.1.1", servername: "imap.example.com", secure: true, logger: false, tls: { rejectUnauthorized: true, servername: "imap.example.com" } }));
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "1.1.1.1", requireTLS: true, tls: { rejectUnauthorized: true, servername: "smtp.example.com" }, disableFileAccess: true, disableUrlAccess: true }));
    expect(state.client.close).toHaveBeenCalledOnce();
    expect(state.transport.close).toHaveBeenCalledOnce();
  });
  it("closes an unsuccessful IMAP connection", async () => {
    state.client.connect.mockRejectedValueOnce(new Error("offline"));
    await expect(new ImapMailboxClient(config).listFolders("")).rejects.toThrow("offline");
    expect(state.client.close).toHaveBeenCalledOnce();
  });
  it("does not fetch source when the message is oversized or UID validity changed", async () => {
    state.client.fetchOne.mockResolvedValue({ uid: 42, size: 11 * 1024 * 1024 });
    await expect(new ImapMailboxClient(config).getMessage("", id)).rejects.toThrow(/10 MiB/);
    expect(state.client.fetchOne).toHaveBeenCalledOnce();
    state.client.fetchOne.mockClear();
    await expect(new ImapMailboxClient(config).getMessage("", encoded(["INBOX", "6", 42]))).rejects.toThrow(/Mailbox changed/);
    expect(state.client.fetchOne).not.toHaveBeenCalled();
  });
  it("parses MIME HTML and returns a stable scoped message id", async () => {
    const source = Buffer.from("From: Alice <alice@example.com>\r\nTo: me@example.com\r\nSubject: Welcome\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello <b>world</b></p>");
    state.client.fetchOne.mockResolvedValueOnce({ uid: 42, size: source.length }).mockResolvedValueOnce({ uid: 42, source, envelope: { subject: "Welcome", from: [{ name: "Alice", address: "alice@example.com" }] }, flags: new Set() });
    const result = await new ImapMailboxClient(config).getMessage("", id);
    expect(result.bodyHtml).toContain("<b>world</b>");
    expect(result.bodyText).toContain("Hello world");
    expect(parseImapMessageId(result.id)).toEqual({ folder: "INBOX", validity: "7", uid: 42 });
  });
  it("keeps unread and custom-label changes independent", async () => {
    await new ImapMailboxClient(config).tagMessage("", id, ["UNREAD", "Important"], []);
    expect(state.client.messageFlagsRemove).toHaveBeenCalledWith("42", ["\\Seen"], { uid: true });
    expect(state.client.messageFlagsAdd).toHaveBeenCalledWith("42", ["Important"], { uid: true });
  });
  it("moves messages to Trash and refuses permanent deletion", async () => {
    state.client.list.mockResolvedValueOnce([{ path: "Trash", specialUse: "\\Trash" }]);
    await new ImapMailboxClient(config).deleteMessage("", id);
    expect(state.client.messageMove).toHaveBeenCalledWith("42", "Trash", { uid: true });
    state.client.list.mockResolvedValueOnce([]);
    await expect(new ImapMailboxClient(config).deleteMessage("", id)).rejects.toThrow(/permanent deletion/);
  });
  it.each(["bad", encoded(["INBOX\r\nDELETE", "7", 42]), encoded(["INBOX", "7", -1]), encoded(["INBOX", "7", "42"])])("rejects malformed or injected message ids", value => {
    expect(() => parseImapMessageId(value)).toThrow(/Invalid/);
  });
  it("sends through the selected account without file or URL attachments", async () => {
    const sent = await new ImapMailboxClient(config).sendMessage("", { to: "person@example.com", subject: "Hello", body: "Message" });
    expect(sent.id).toBe("sent-id");
    expect(state.transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: { name: "Me", address: "me@example.com" }, to: "person@example.com", text: "Message" }));
    expect(state.transport.close).toHaveBeenCalledOnce();
  });
});
