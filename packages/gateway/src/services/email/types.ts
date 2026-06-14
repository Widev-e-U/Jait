// Shared types for the email integration (Gmail + Outlook/Microsoft Graph).

export type EmailProvider = "gmail" | "outlook";

/** Public metadata about a connected mailbox (no tokens). */
export interface EmailAccount {
  id: string;
  userId: string | null;
  provider: EmailProvider;
  email: string;
  displayName: string;
  status: "connected" | "error";
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** OAuth token bundle persisted (encrypted) in the user-secret store. */
export interface EmailTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  scope?: string;
}

/** A lightweight message summary for list views. */
export interface EmailMessageSummary {
  id: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  /** Provider label / category names attached to the message. */
  labels: string[];
  hasAttachments: boolean;
}

/** A fully-hydrated message including its body. */
export interface EmailMessageFull extends EmailMessageSummary {
  cc: string;
  bodyText: string;
  bodyHtml: string;
}

/** A mailbox folder / label the user can filter by. */
export interface EmailFolder {
  id: string;
  name: string;
  unreadCount?: number;
}

export interface ListMessagesOptions {
  folder?: string;
  query?: string;
  limit?: number;
}

export interface SendMessageInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  /** When set, send as a reply within this message's thread. */
  replyToMessageId?: string;
  /** Send the body as HTML instead of plain text. */
  html?: boolean;
}

/**
 * Provider-specific mailbox client. The {@link EmailService} owns token
 * refresh and hands a valid access token to these stateless operations.
 */
export interface MailboxClient {
  listMessages(accessToken: string, opts: ListMessagesOptions): Promise<EmailMessageSummary[]>;
  getMessage(accessToken: string, id: string): Promise<EmailMessageFull>;
  sendMessage(accessToken: string, input: SendMessageInput): Promise<{ id: string }>;
  /** Add/remove a label (Gmail) or category (Outlook) by human name. */
  tagMessage(
    accessToken: string,
    id: string,
    add: string[],
    remove: string[],
  ): Promise<void>;
  /** Move a message to trash / deleted items. */
  deleteMessage(accessToken: string, id: string): Promise<void>;
  listFolders(accessToken: string): Promise<EmailFolder[]>;
  /** Resolve the authenticated account's primary email address. */
  getProfileEmail(accessToken: string): Promise<string>;
}
