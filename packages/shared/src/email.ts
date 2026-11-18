export type OAuthEmailProvider = "gmail" | "outlook";
export type EmailProvider = OAuthEmailProvider | "imap";

/** Public metadata about a connected mailbox (no tokens). */
export interface EmailAccount {
  id: string;
  userId: string | null;
  provider: EmailProvider;
  email: string;
  displayName: string;
  signature?: string;
  signatureEnabled?: boolean;
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
  includeSignature?: boolean;
}

export interface MailServerConfig {
  host: string;
  port: number;
  /** false requires STARTTLS; cleartext authentication is never allowed. */
  secure: boolean;
  user: string;
  password: string;
}
export interface ConnectMailboxInput {
  email: string;
  displayName?: string;
  imap: MailServerConfig;
  smtp: MailServerConfig;
}
export interface EmailAccountSettings {
  displayName?: string;
  signature?: string;
  signatureEnabled?: boolean;
}
export interface DiscoveredMailSettings {
  name: string;
  imap: Omit<MailServerConfig, "password">;
  smtp: Omit<MailServerConfig, "password">;
}
