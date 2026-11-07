// Email tools — let agents read, send, tag, and delete mail across the user's
// connected Gmail / Outlook accounts via the EmailService.

import type { EmailService } from "../services/email/index.js";
import type { WsControlPlane } from "../ws.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import { ellipsizeText, formatEllipsedList } from "./list-preview.js";

function userId(context: ToolContext): string | null {
  return context.userId ?? null;
}

/** Push an Email-page UI command to the user's active session, when wired. */
function controlEmailPage(
  ws: WsControlPlane | undefined,
  context: ToolContext,
  data: import("@jait/shared").EmailControlData,
): void {
  ws?.sendUICommand(
    { command: "email.control", data: data as unknown as Record<string, unknown> },
    context.sessionId,
  );
}

interface ListInput {
  accountId?: string;
  folder?: string;
  query?: string;
  limit?: number;
}

export function createEmailListTool(email: EmailService): ToolDefinition<ListInput> {
  return {
    name: "email_list",
    description:
      "List recent emails from a connected mailbox (Gmail/Outlook). Optionally filter by folder " +
      "(e.g. 'inbox', 'sent', or a Gmail label) and a provider search query. Returns message summaries " +
      "with ids you can pass to email_read, email_tag, or email_delete.",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Connected account id. Omit to use the first/default account." },
        folder: { type: "string", description: "Folder/label, e.g. 'inbox', 'sent', 'spam'. Defaults to inbox." },
        query: { type: "string", description: "Search query (Gmail search syntax / Outlook $search)." },
        limit: { type: "number", description: "Max messages to return (1–50, default 25)." },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        const { account, messages } = await email.listMessages(userId(context), input?.accountId, {
          folder: input?.folder,
          query: input?.query,
          limit: input?.limit,
        });
        const lines = messages.map((message) => {
          const when = message.date.includes("T") ? message.date.slice(0, 16).replace("T", " ") : message.date;
          const flags =
            (message.unread ? " [unread]" : "") + (message.hasAttachments ? " [attachments]" : "");
          return `• ${when} — ${message.from}: ${ellipsizeText(message.subject || message.snippet)}${flags}`;
        });
        return {
          ok: true,
          message:
            `${messages.length} message(s) from ${account.email}` +
            (lines.length ? `:\n${formatEllipsedList(lines, 15)}` : "."),
          data: { account: { id: account.id, email: account.email, provider: account.provider }, messages },
        };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Failed to list emails" };
      }
    },
  };
}

interface ReadInput {
  id: string;
  accountId?: string;
}

export function createEmailReadTool(email: EmailService): ToolDefinition<ReadInput> {
  return {
    name: "email_read",
    description: "Read the full content (headers + body) of a single email by its message id.",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message id (from email_list)." },
        accountId: { type: "string", description: "Connected account id. Omit to use the default account." },
      },
      required: ["id"],
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        const message = await email.getMessage(userId(context), input?.accountId, input.id);
        const body = message.bodyText || message.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return {
          ok: true,
          message: `${message.subject} — from ${message.from}`,
          data: { ...message, body, accountId: input?.accountId ?? email.resolveAccount?.(userId(context)).id },
        };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Failed to read email" };
      }
    },
  };
}

interface SendInput {
  to?: string;
  subject?: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyToMessageId?: string;
  html?: boolean;
  includeSignature?: boolean;
  accountId?: string;
}

export function createEmailSendTool(email: EmailService, ws?: WsControlPlane): ToolDefinition<SendInput> {
  return {
    name: "email_send",
    description:
      "Send an email, or reply to an existing message when replyToMessageId is set. " +
      "Provide to/subject/body for a new message.",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "medium",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient address(es), comma-separated." },
        subject: { type: "string", description: "Subject line (new messages)." },
        body: {
          type: "string",
          description:
            "Format every email for readability; never run the greeting, message, and closing together on one line. " +
            "Use a suitable greeting, blank lines between paragraphs, and a separate closing and sender name when appropriate. " +
            "For plain text use newline characters; for HTML use appropriate paragraph and line-break tags. " +
            "Avoid duplicating the account's saved signature when it is included. Respect the user's requested wording and format.",
        },
        cc: { type: "string", description: "Cc address(es), comma-separated." },
        bcc: { type: "string", description: "Bcc address(es), comma-separated." },
        replyToMessageId: { type: "string", description: "Reply within this message's thread." },
        includeSignature: { type: "boolean", description: "Include the sending account's saved signature (default true)." },
        html: { type: "boolean", description: "Send body as HTML (default plain text)." },
        accountId: { type: "string", description: "Account to send from. Omit for the default account." },
      },
      required: ["body"],
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        await email.sendMessage(userId(context), input?.accountId, {
          to: input.to ?? "",
          subject: input.subject ?? "",
          body: input.body,
          cc: input.cc,
          bcc: input.bcc,
          replyToMessageId: input.replyToMessageId,
          html: input.html,
          ...(input.includeSignature !== undefined ? { includeSignature: input.includeSignature } : {}),
        });
        controlEmailPage(ws, context, { action: "refresh", accountId: input?.accountId });
        return { ok: true, message: input.replyToMessageId ? "Reply sent." : `Email sent to ${input.to}.` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Failed to send email" };
      }
    },
  };
}

interface TagInput {
  id: string;
  add?: string[];
  remove?: string[];
  accountId?: string;
}

export function createEmailTagTool(email: EmailService, ws?: WsControlPlane): ToolDefinition<TagInput> {
  return {
    name: "email_tag",
    description:
      "Add or remove labels (Gmail) / categories (Outlook) on a message. New Gmail labels are created " +
      "automatically. Use built-in names like 'STARRED', 'IMPORTANT', or 'UNREAD' to flag/mark messages.",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "medium",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message id." },
        add: { type: "array", items: { type: "string" }, description: "Label/category names to add." },
        remove: { type: "array", items: { type: "string" }, description: "Label/category names to remove." },
        accountId: { type: "string", description: "Connected account id. Omit for the default account." },
      },
      required: ["id"],
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        await email.tagMessage(userId(context), input?.accountId, input.id, input.add ?? [], input.remove ?? []);
        controlEmailPage(ws, context, { action: "refresh", accountId: input?.accountId });
        return { ok: true, message: "Tags updated." };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Failed to tag email" };
      }
    },
  };
}

interface DeleteInput {
  id: string;
  accountId?: string;
}

export function createEmailDeleteTool(email: EmailService, ws?: WsControlPlane): ToolDefinition<DeleteInput> {
  return {
    name: "email_delete",
    description: "Move an email to trash / deleted items by its message id.",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "high",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message id." },
        accountId: { type: "string", description: "Connected account id. Omit for the default account." },
      },
      required: ["id"],
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        await email.deleteMessage(userId(context), input?.accountId, input.id);
        controlEmailPage(ws, context, { action: "refresh", accountId: input?.accountId });
        return { ok: true, message: "Message moved to trash." };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Failed to delete email" };
      }
    },
  };
}

interface ViewInput {
  action: "navigate" | "open" | "compose" | "refresh";
  accountId?: string;
  folder?: string;
  messageId?: string;
  to?: string;
  subject?: string;
  body?: string;
  replyToMessageId?: string;
}

export function createEmailViewTool(ws: WsControlPlane, email?: EmailService): ToolDefinition<ViewInput> {
  return {
    name: "email_view",
    description:
      "Display an email as a rendered card directly in this chat with action=open and messageId. " +
      "Use navigate to open the Email page, compose to show a draft for review, or refresh to reload it. " +
      "Always specify accountId when multiple mailboxes are connected (email_accounts lists them).",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["navigate", "open", "compose", "refresh"],
          description: "navigate=open a folder, open=show a message, compose=open a draft, refresh=reload the list.",
        },
        accountId: { type: "string", description: "Account to act on. Omit for the page's active account." },
        folder: { type: "string", description: "For navigate: folder/label, e.g. 'inbox', 'sent'." },
        messageId: { type: "string", description: "For open: message id to display." },
        to: { type: "string", description: "For compose: recipient(s)." },
        subject: { type: "string", description: "For compose: subject." },
        body: { type: "string", description: "For compose: draft body." },
        replyToMessageId: { type: "string", description: "For compose: make it a reply to this message." },
      },
      required: ["action"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (input.action === "open") {
        if (!input.messageId || !email) return { ok: false, message: "A messageId and connected email service are required." };
        try {
          const account = email.resolveAccount(userId(context), input.accountId);
          const message = await email.getMessage(userId(context), account.id, input.messageId);
          return { ok: true, message: `Email: ${message.subject} — ${message.from}`, data: { accountId: account.id, message } };
        } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Email unavailable" }; }
      }
      controlEmailPage(ws, context, {
        action: input.action,
        accountId: input.accountId,
        folder: input.folder,
        messageId: input.messageId,
        to: input.to,
        subject: input.subject,
        body: input.body,
        replyToMessageId: input.replyToMessageId,
      });
      return { ok: true, message: `Email page: ${input.action}.` };
    },
  };
}

export function createEmailTools(email: EmailService, ws?: WsControlPlane): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: "email_accounts", description: "List connected email account ids and addresses. Use accountId when multiple mailboxes are connected.",
      tier: "standard", category: "web", source: "builtin", risk: "low", parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        const accounts = email.listAccounts(userId(context)).map(({ id, email: address, provider, displayName, status }) => ({ id, email: address, provider, displayName, status }));
        return { ok: true, message: `${accounts.length} connected email account(s).`, data: { accounts } };
      },
    },
    createEmailListTool(email),
    createEmailReadTool(email),
    createEmailSendTool(email, ws),
    createEmailTagTool(email, ws),
    createEmailDeleteTool(email, ws),
  ] as ToolDefinition[];
  if (ws) tools.push(createEmailViewTool(ws, email) as ToolDefinition);
  return tools;
}
