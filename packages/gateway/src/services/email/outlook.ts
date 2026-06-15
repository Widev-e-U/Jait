// Outlook mailbox client (Microsoft Graph v1.0).

import type {
  EmailFolder,
  EmailMessageFull,
  EmailMessageSummary,
  ListMessagesOptions,
  MailboxClient,
  SendMessageInput,
} from "./types.js";

const BASE = "https://graph.microsoft.com/v1.0";

interface GraphRecipient { emailAddress?: { name?: string; address?: string } }
interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  categories?: string[];
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  body?: { contentType?: string; content?: string };
}

function fmtRecipient(r: GraphRecipient | undefined): string {
  const ea = r?.emailAddress;
  if (!ea) return "";
  return ea.name ? `${ea.name} <${ea.address ?? ""}>` : ea.address ?? "";
}

function fmtRecipients(list: GraphRecipient[] | undefined): string {
  return (list ?? []).map(fmtRecipient).filter(Boolean).join(", ");
}

function toGraphRecipients(value: string | undefined): { emailAddress: { address: string } }[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

export class OutlookClient implements MailboxClient {
  private async gfetch(accessToken: string, path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Microsoft Graph error: ${msg}`);
    }
    return data;
  }

  private summarize(m: GraphMessage): EmailMessageSummary {
    return {
      id: m.id,
      threadId: m.conversationId,
      from: fmtRecipient(m.from),
      to: fmtRecipients(m.toRecipients),
      subject: m.subject ?? "",
      snippet: m.bodyPreview ?? "",
      date: m.receivedDateTime ?? "",
      unread: m.isRead === false,
      labels: m.categories ?? [],
      hasAttachments: m.hasAttachments ?? false,
    };
  }

  async listMessages(accessToken: string, opts: ListMessagesOptions): Promise<EmailMessageSummary[]> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
    const folder = opts.folder && opts.folder.toLowerCase() !== "all" ? opts.folder : "inbox";
    const params = new URLSearchParams({
      $top: String(limit),
      $select: "id,conversationId,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,categories,from,toRecipients",
    });
    let path: string;
    if (opts.query) {
      // $search cannot be combined with $orderby.
      params.set("$search", `"${opts.query.replace(/"/g, "")}"`);
      path = `/me/mailFolders/${folder}/messages?${params.toString()}`;
    } else {
      params.set("$orderby", "receivedDateTime desc");
      path = `/me/mailFolders/${folder}/messages?${params.toString()}`;
    }
    const data = (await this.gfetch(accessToken, path, {
      headers: { ConsistencyLevel: "eventual" },
    })) as { value?: GraphMessage[] };
    return (data.value ?? []).map((m) => this.summarize(m));
  }

  async getMessage(accessToken: string, id: string): Promise<EmailMessageFull> {
    const m = (await this.gfetch(accessToken, `/me/messages/${encodeURIComponent(id)}`)) as GraphMessage;
    const summary = this.summarize(m);
    const isHtml = (m.body?.contentType ?? "").toLowerCase() === "html";
    return {
      ...summary,
      cc: fmtRecipients(m.ccRecipients),
      bodyText: isHtml ? "" : m.body?.content ?? "",
      bodyHtml: isHtml ? m.body?.content ?? "" : "",
    };
  }

  async sendMessage(accessToken: string, input: SendMessageInput): Promise<{ id: string }> {
    if (input.replyToMessageId) {
      await this.gfetch(accessToken, `/me/messages/${encodeURIComponent(input.replyToMessageId)}/reply`, {
        method: "POST",
        body: JSON.stringify({
          message: {
            toRecipients: input.to ? toGraphRecipients(input.to) : undefined,
            ccRecipients: toGraphRecipients(input.cc),
          },
          comment: input.body,
        }),
      });
      return { id: input.replyToMessageId };
    }
    await this.gfetch(accessToken, "/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: input.html ? "HTML" : "Text", content: input.body },
          toRecipients: toGraphRecipients(input.to),
          ccRecipients: toGraphRecipients(input.cc),
          bccRecipients: toGraphRecipients(input.bcc),
        },
        saveToSentItems: true,
      }),
    });
    return { id: "" };
  }

  async tagMessage(accessToken: string, id: string, add: string[], remove: string[]): Promise<void> {
    const eid = encodeURIComponent(id);
    const m = (await this.gfetch(accessToken, `/me/messages/${eid}?$select=categories`)) as GraphMessage;
    const current = new Set(m.categories ?? []);
    for (const c of add) current.add(c);
    for (const c of remove) current.delete(c);
    await this.gfetch(accessToken, `/me/messages/${eid}`, {
      method: "PATCH",
      body: JSON.stringify({ categories: [...current] }),
    });
  }

  async deleteMessage(accessToken: string, id: string): Promise<void> {
    // DELETE moves the message to Deleted Items.
    await this.gfetch(accessToken, `/me/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async listFolders(accessToken: string): Promise<EmailFolder[]> {
    const data = (await this.gfetch(accessToken, "/me/mailFolders?$top=50&$select=id,displayName,unreadItemCount")) as {
      value?: { id: string; displayName: string; unreadItemCount?: number }[];
    };
    return (data.value ?? []).map((f) => ({ id: f.id, name: f.displayName, unreadCount: f.unreadItemCount }));
  }

  async getProfileEmail(accessToken: string): Promise<string> {
    const data = (await this.gfetch(accessToken, "/me?$select=mail,userPrincipalName")) as {
      mail?: string;
      userPrincipalName?: string;
    };
    return data.mail ?? data.userPrincipalName ?? "";
  }
}
