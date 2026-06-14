// Gmail mailbox client (Gmail REST API v1).

import type {
  EmailFolder,
  EmailMessageFull,
  EmailMessageSummary,
  ListMessagesOptions,
  MailboxClient,
  SendMessageInput,
} from "./types.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart;
}

// Map friendly folder names to Gmail system label ids; pass real label ids through.
const SYSTEM_LABELS: Record<string, string> = {
  inbox: "INBOX", sent: "SENT", drafts: "DRAFT", draft: "DRAFT",
  spam: "SPAM", trash: "TRASH", starred: "STARRED", important: "IMPORTANT", unread: "UNREAD",
};
function normalizeLabelId(folder: string): string {
  return SYSTEM_LABELS[folder.toLowerCase()] ?? folder;
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(data?: string): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Walk the MIME tree collecting the first text/plain and text/html bodies. */
function extractBodies(part: GmailPart | undefined, acc: { text: string; html: string; attachments: boolean }): void {
  if (!part) return;
  const mime = part.mimeType ?? "";
  if (part.filename) acc.attachments = true;
  if (mime === "text/plain" && !acc.text) acc.text = decodeBody(part.body?.data);
  else if (mime === "text/html" && !acc.html) acc.html = decodeBody(part.body?.data);
  for (const child of part.parts ?? []) extractBodies(child, acc);
}

export class GmailClient implements MailboxClient {
  private async gfetch(accessToken: string, path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Gmail API error: ${msg}`);
    }
    return data;
  }

  private summarize(m: GmailMessage, labelNames: Map<string, string>): EmailMessageSummary {
    const h = m.payload?.headers;
    const labelIds = m.labelIds ?? [];
    return {
      id: m.id,
      threadId: m.threadId,
      from: header(h, "From"),
      to: header(h, "To"),
      subject: header(h, "Subject"),
      snippet: m.snippet ?? "",
      date: header(h, "Date"),
      unread: labelIds.includes("UNREAD"),
      labels: labelIds
        .filter((id) => !id.startsWith("CATEGORY_"))
        .map((id) => labelNames.get(id) ?? id),
      hasAttachments: false,
    };
  }

  private async labelMaps(accessToken: string): Promise<{ byId: Map<string, string>; byName: Map<string, string> }> {
    const data = (await this.gfetch(accessToken, "/labels")) as { labels?: { id: string; name: string }[] };
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const l of data.labels ?? []) {
      byId.set(l.id, l.name);
      byName.set(l.name.toLowerCase(), l.id);
    }
    return { byId, byName };
  }

  async listMessages(accessToken: string, opts: ListMessagesOptions): Promise<EmailMessageSummary[]> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
    const params = new URLSearchParams({ maxResults: String(limit) });
    if (opts.query) params.set("q", opts.query);
    if (opts.folder && opts.folder.toLowerCase() !== "all") {
      params.set("labelIds", normalizeLabelId(opts.folder));
    }
    const list = (await this.gfetch(accessToken, `/messages?${params.toString()}`)) as {
      messages?: { id: string }[];
    };
    const ids = (list.messages ?? []).map((x) => x.id);
    if (ids.length === 0) return [];
    const { byId } = await this.labelMaps(accessToken);
    const metas = await Promise.all(
      ids.map((id) =>
        this.gfetch(
          accessToken,
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        ) as Promise<GmailMessage>,
      ),
    );
    return metas.map((m) => this.summarize(m, byId));
  }

  async getMessage(accessToken: string, id: string): Promise<EmailMessageFull> {
    const m = (await this.gfetch(accessToken, `/messages/${id}?format=full`)) as GmailMessage;
    const { byId } = await this.labelMaps(accessToken);
    const summary = this.summarize(m, byId);
    const bodies = { text: "", html: "", attachments: false };
    extractBodies(m.payload, bodies);
    return {
      ...summary,
      cc: header(m.payload?.headers, "Cc"),
      bodyText: bodies.text,
      bodyHtml: bodies.html,
      hasAttachments: bodies.attachments,
    };
  }

  async sendMessage(accessToken: string, input: SendMessageInput): Promise<{ id: string }> {
    const lines = [
      `To: ${input.to}`,
      input.cc ? `Cc: ${input.cc}` : "",
      input.bcc ? `Bcc: ${input.bcc}` : "",
      `Subject: ${input.subject}`,
      "MIME-Version: 1.0",
      `Content-Type: ${input.html ? "text/html" : "text/plain"}; charset=UTF-8`,
      "",
      input.body,
    ].filter(Boolean);
    const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
    const body: Record<string, unknown> = { raw };
    if (input.replyToMessageId) {
      const orig = (await this.gfetch(accessToken, `/messages/${input.replyToMessageId}?format=metadata`)) as GmailMessage;
      if (orig.threadId) body.threadId = orig.threadId;
    }
    const sent = (await this.gfetch(accessToken, "/messages/send", {
      method: "POST",
      body: JSON.stringify(body),
    })) as { id: string };
    return { id: sent.id };
  }

  async tagMessage(accessToken: string, id: string, add: string[], remove: string[]): Promise<void> {
    const { byName } = await this.labelMaps(accessToken);
    const resolve = async (name: string): Promise<string> => {
      const builtin = name.toUpperCase();
      if (["INBOX", "UNREAD", "STARRED", "IMPORTANT", "SPAM", "TRASH"].includes(builtin)) return builtin;
      const existing = byName.get(name.toLowerCase());
      if (existing) return existing;
      const created = (await this.gfetch(accessToken, "/labels", {
        method: "POST",
        body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
      })) as { id: string };
      byName.set(name.toLowerCase(), created.id);
      return created.id;
    };
    const addLabelIds = await Promise.all(add.map(resolve));
    const removeLabelIds = await Promise.all(remove.map(resolve));
    await this.gfetch(accessToken, `/messages/${id}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  }

  async deleteMessage(accessToken: string, id: string): Promise<void> {
    await this.gfetch(accessToken, `/messages/${id}/trash`, { method: "POST" });
  }

  async listFolders(accessToken: string): Promise<EmailFolder[]> {
    const data = (await this.gfetch(accessToken, "/labels")) as {
      labels?: { id: string; name: string; type?: string }[];
    };
    return (data.labels ?? [])
      .filter((l) => !l.id.startsWith("CATEGORY_"))
      .map((l) => ({ id: l.id, name: l.name }));
  }

  async getProfileEmail(accessToken: string): Promise<string> {
    const data = (await this.gfetch(accessToken, "/profile")) as { emailAddress?: string };
    return data.emailAddress ?? "";
  }
}
