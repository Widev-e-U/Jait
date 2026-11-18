export type { EmailProvider, OAuthEmailProvider, EmailAccount, EmailTokens, EmailFolder, EmailMessageSummary, EmailMessageFull, ListMessagesOptions, SendMessageInput, MailServerConfig, ConnectMailboxInput, EmailAccountSettings, DiscoveredMailSettings } from "@jait/shared";
import type { EmailMessageSummary, EmailMessageFull, EmailFolder, ListMessagesOptions, SendMessageInput } from "@jait/shared";

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
