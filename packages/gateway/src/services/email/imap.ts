import { ImapFlow, type FetchMessageObject } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import type { ConnectMailboxInput, EmailMessageFull, EmailMessageSummary, ListMessagesOptions, MailboxClient, SendMessageInput } from "./types.js";
import { publicMailServer } from "./connection.js";

const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
function address(value?: { name?: string; address?: string }[]): string {
  return (value ?? []).map(item => item.name ? `${item.name} <${item.address || ""}>` : item.address || "").join(", ");
}
function messageId(client: ImapFlow, uid: number): string {
  if (!client.mailbox) throw new Error("Mailbox is not selected");
  return Buffer.from(JSON.stringify([client.mailbox.path, String(client.mailbox.uidValidity), uid])).toString("base64url");
}
export function parseImapMessageId(id: string): { folder: string; validity: string; uid: number } {
  try {
    if (id.length > 2048) throw new Error();
    const [folder, validity, uid] = JSON.parse(Buffer.from(id, "base64url").toString());
    if (typeof folder !== "string" || !folder || folder.length > 1024 || /[\r\n\0]/.test(folder) || typeof validity !== "string" || !/^\d+$/.test(validity) || !Number.isSafeInteger(uid) || uid < 1) throw new Error();
    return { folder, validity, uid };
  } catch { throw new Error("Invalid IMAP message id"); }
}
function summary(client: ImapFlow, item: FetchMessageObject): EmailMessageSummary {
  return { id: messageId(client, item.uid), from: address(item.envelope?.from), to: address(item.envelope?.to),
    subject: item.envelope?.subject || "", snippet: "", date: item.envelope?.date instanceof Date ? item.envelope.date.toISOString() : item.envelope?.date || "",
    unread: !item.flags?.has("\\Seen"), labels: [...(item.flags ?? [])].map(flag => flag === "\\Flagged" ? "STARRED" : flag),
    hasAttachments: Boolean(item.bodyStructure?.childNodes?.some(part => part.disposition === "attachment")) };
}
export class ImapMailboxClient implements MailboxClient {
  constructor(private readonly config: ConnectMailboxInput) {}
  private async withClient<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
    const server = await publicMailServer(this.config.imap);
    const client = new ImapFlow({ host: server.host, port: server.port, secure: server.secure, servername: server.servername,
      ...(server.secure ? {} : { doSTARTTLS: true }), auth: { user: server.user, pass: server.password },
      tls: { rejectUnauthorized: true, servername: server.servername }, logger: false,
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15_000, maxIdleTime: 15_000 });
    // EventEmitter errors must be observed, without logging credentials.
    client.on("error", () => {});
    const timer = setTimeout(() => client.close(), 30_000);
    try { await client.connect(); return await operation(client); }
    finally { clearTimeout(timer); client.close(); }
  }
  private async transport() {
    const server = await publicMailServer(this.config.smtp);
    return nodemailer.createTransport({ host: server.host, port: server.port, secure: server.secure,
      requireTLS: !server.secure, tls: { servername: server.servername, rejectUnauthorized: true },
      auth: { user: server.user, pass: server.password }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15_000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
  }
  async verify(): Promise<void> {
    await this.withClient(async () => {});
    const transport = await this.transport();
    try { await transport.verify(); } finally { transport.close(); }
  }
  async listMessages(_token: string, opts: ListMessagesOptions): Promise<EmailMessageSummary[]> {
    return this.withClient(async client => {
      const folder = !opts.folder || opts.folder.toLowerCase() === "inbox" ? "INBOX" : opts.folder;
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        if (!client.mailbox || client.mailbox.exists === 0) return [];
        const limit = Math.max(1, Math.min(100, opts.limit ?? 50));
        if (opts.query) {
          const ids = await client.search({ text: opts.query.slice(0, 1000) }, { uid: true });
          if (!ids || !ids.length) return [];
          const messages = await client.fetchAll(ids.slice(-limit), { envelope: true, flags: true, bodyStructure: true }, { uid: true });
          return messages.reverse().map(item => summary(client, item));
        }
        const start = Math.max(1, client.mailbox.exists - limit + 1);
        return (await client.fetchAll(`${start}:*`, { envelope: true, flags: true, bodyStructure: true })).reverse().map(item => summary(client, item));
      } finally { lock.release(); }
    });
  }
  private async read(client: ImapFlow, id: string) {
    const decoded = parseImapMessageId(id);
    const lock = await client.getMailboxLock(decoded.folder, { readOnly: true });
    try {
      if (!client.mailbox || String(client.mailbox.uidValidity) !== decoded.validity) throw new Error("Mailbox changed. Refresh the message list.");
      const info = await client.fetchOne(String(decoded.uid), { envelope: true, flags: true, size: true }, { uid: true });
      if (!info) throw new Error("Message no longer exists");
      if (!info.size || info.size > MAX_MESSAGE_BYTES) throw new Error("Message exceeds the 10 MiB reading limit");
      const data = await client.fetchOne(String(decoded.uid), { source: { start: 0, maxLength: MAX_MESSAGE_BYTES }, envelope: true, flags: true }, { uid: true });
      if (!data || !data.source) throw new Error("Message content unavailable");
      const parsed = await simpleParser(data.source, { maxHtmlLengthToParse: MAX_MESSAGE_BYTES });
      const full: EmailMessageFull = { ...summary(client, data), cc: Array.isArray(parsed.cc) ? parsed.cc.map(item => item.text).join(", ") : parsed.cc?.text || "",
        bodyText: parsed.text || "", bodyHtml: parsed.html || "", hasAttachments: parsed.attachments.length > 0, snippet: (parsed.text || "").slice(0, 200) };
      return { full, parsed };
    } finally { lock.release(); }
  }
  async getMessage(_token: string, id: string): Promise<EmailMessageFull> {
    return this.withClient(async client => (await this.read(client, id)).full);
  }
  async sendMessage(_token: string, input: SendMessageInput): Promise<{ id: string }> {
    const original = input.replyToMessageId ? await this.withClient(client => this.read(client, input.replyToMessageId!)) : null;
    const to = input.to || original?.parsed.replyTo?.text || original?.full.from;
    if (!to || /[\r\n]/.test(to + (input.subject || ""))) throw new Error("Invalid recipient or subject");
    const transport = await this.transport();
    try {
      const result = await transport.sendMail({ from: { name: this.config.displayName || "", address: this.config.email },
        to, cc: input.cc, bcc: input.bcc, subject: input.subject || (original ? "Re: " + original.full.subject.replace(/^Re:\s*/i, "") : ""),
        ...(input.html ? { html: input.body } : { text: input.body }),
        ...(original?.parsed.messageId ? { inReplyTo: original.parsed.messageId, references: [...(Array.isArray(original.parsed.references) ? original.parsed.references : original.parsed.references ? [original.parsed.references] : []), original.parsed.messageId] } : {}) });
      return { id: result.messageId };
    } finally { transport.close(); }
  }
  async tagMessage(_token: string, id: string, add: string[], remove: string[]): Promise<void> {
    const decoded = parseImapMessageId(id);
    await this.withClient(async client => {
      const lock = await client.getMailboxLock(decoded.folder);
      try {
        if (!client.mailbox || String(client.mailbox.uidValidity) !== decoded.validity) throw new Error("Mailbox changed. Refresh first.");
        const apply = async (labels: string[], adding: boolean) => {
          for (const label of labels.slice(0, 20)) {
            let flag = label;
            if (label.toUpperCase() === "STARRED") flag = "\\Flagged";
            else if (label.toUpperCase() === "UNREAD") flag = "\\Seen";
            else if (!/^[a-zA-Z0-9_-]{1,64}$/.test(flag)) throw new Error("Unsupported mailbox label");
            const shouldAdd = label.toUpperCase() === "UNREAD" ? !adding : adding;
            if (shouldAdd) await client.messageFlagsAdd(String(decoded.uid), [flag], { uid: true });
            else await client.messageFlagsRemove(String(decoded.uid), [flag], { uid: true });
          }
        };
        await apply(add, true); await apply(remove, false);
      } finally { lock.release(); }
    });
  }
  async deleteMessage(_token: string, id: string): Promise<void> {
    const decoded = parseImapMessageId(id);
    await this.withClient(async client => {
      const folders = await client.list();
      const trash = folders.find(folder => folder.specialUse === "\\Trash");
      if (!trash || trash.path === decoded.folder) throw new Error("No separate Trash folder is available; permanent deletion is disabled.");
      const lock = await client.getMailboxLock(decoded.folder);
      try {
        if (!client.mailbox || String(client.mailbox.uidValidity) !== decoded.validity) throw new Error("Mailbox changed. Refresh first.");
        await client.messageMove(String(decoded.uid), trash.path, { uid: true });
      } finally { lock.release(); }
    });
  }
  async listFolders(_token: string) { return this.withClient(async client => (await client.list()).slice(0, 200).map(folder => ({ id: folder.path, name: folder.name }))); }
  async getProfileEmail() { return this.config.email; }
}
