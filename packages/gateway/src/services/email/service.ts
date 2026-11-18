// EmailService — orchestrates connected mailboxes: OAuth connect flow,
// account persistence, token storage/refresh, and provider-agnostic ops.

import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { JaitDB } from "../../db/connection.js";
import { emailAccounts } from "../../db/schema.js";
import { uuidv7 } from "../../db/uuidv7.js";
import type { UserSecretService } from "../user-secrets.js";
import { ImapMailboxClient } from "./imap.js";
import { connectMailboxSchema, emailAccountSettingsSchema, sendEmailSchema } from "./connection.js";
import type { ConnectMailboxInput, EmailAccountSettings, OAuthEmailProvider } from "@jait/shared";
import { GmailClient } from "./gmail.js";
import { OutlookClient } from "./outlook.js";
import {
  buildAuthorizeUrl,
  createPkce,
  envClientCredentials,
  exchangeCode,
  refreshTokens,
  type OAuthClientCredentials,
} from "./oauth.js";
import type {
  EmailAccount,
  EmailFolder,
  EmailMessageFull,
  EmailMessageSummary,
  EmailProvider,
  EmailTokens,
  ListMessagesOptions,
  MailboxClient,
  SendMessageInput,
} from "./types.js";

const TOKEN_SECRET_TYPE = "email-account";
const APP_SECRET_TYPE = "email-oauth-app";
const PROVIDERS: OAuthEmailProvider[] = ["gmail", "outlook"];

interface PendingConnect {
  userId: string | null;
  provider: OAuthEmailProvider;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export class EmailService {
  private readonly clients: Record<OAuthEmailProvider, MailboxClient> = {
    gmail: new GmailClient(),
    outlook: new OutlookClient(),
  };
  private readonly pending = new Map<string, PendingConnect>();
  // Summaries only, held in memory and scoped by the resolved account.
  private readonly inboxCache = new Map<string, EmailMessageSummary[]>();
  private readonly inboxGeneration = new Map<string, number>();
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private refreshing = false;

  startInboxRefresh(): void {
    if (this.refreshTimer) return;
    const refresh = async () => {
      if (this.refreshing) return;
      this.refreshing = true;
      try {
        const accounts = this.db.select().from(emailAccounts).all();
        for (const account of accounts) {
          try { await this.listMessages(account.userId, account.id, { folder: "inbox", limit: 30 }); }
          catch { /* A disconnected or temporarily unavailable mailbox should not stop others. */ }
        }
      } finally { this.refreshing = false; }
    };
    void refresh();
    this.refreshTimer = setInterval(() => void refresh(), 10 * 60 * 1000);
    this.refreshTimer.unref();
  }

  stopInboxRefresh(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  cachedInbox(userId: string | null, accountId?: string): EmailMessageSummary[] | null {
    const account = this.resolveAccount(userId, accountId);
    return this.inboxCache.get(account.id) ?? null;
  }

  private invalidateInbox(accountId: string): void {
    this.inboxCache.delete(accountId);
    this.inboxGeneration.set(accountId, (this.inboxGeneration.get(accountId) ?? 0) + 1);
  }

  constructor(
    private readonly db: JaitDB,
    private readonly secrets: UserSecretService,
  ) {}

  // ── OAuth client credentials ───────────────────────────────────────

  /** Resolve OAuth app credentials: per-user secret first, then env. */
  resolveCredentials(provider: OAuthEmailProvider, userId: string | null): OAuthClientCredentials | null {
    const clientId = this.secrets.getValue(userId, APP_SECRET_TYPE, `${provider}-client-id`);
    const clientSecret = this.secrets.getValue(userId, APP_SECRET_TYPE, `${provider}-client-secret`);
    if (clientId && clientSecret) return { clientId, clientSecret };
    return envClientCredentials(provider);
  }

  /** Which providers are ready to connect (have OAuth app credentials). */
  configuredProviders(userId: string | null): Record<OAuthEmailProvider, boolean> {
    return {
      gmail: !!this.resolveCredentials("gmail", userId),
      outlook: !!this.resolveCredentials("outlook", userId),
    };
  }

  saveAppCredentials(userId: string | null, provider: OAuthEmailProvider, creds: OAuthClientCredentials): void {
    if (!creds.clientId && !creds.clientSecret) {
      for (const secret of this.secrets.list(userId, APP_SECRET_TYPE)) {
        if ([`${provider}-client-id`, `${provider}-client-secret`].includes(secret.key)) this.secrets.delete(secret.id, userId);
      }
      return;
    }
    this.secrets.save({
      userId,
      type: APP_SECRET_TYPE,
      key: `${provider}-client-id`,
      label: `${provider} OAuth client id`,
      value: creds.clientId,
    });
    this.secrets.save({
      userId,
      type: APP_SECRET_TYPE,
      key: `${provider}-client-secret`,
      label: `${provider} OAuth client secret`,
      value: creds.clientSecret,
    });
  }

  // ── Connect flow ───────────────────────────────────────────────────

  startConnect(params: {
    userId: string | null;
    provider: OAuthEmailProvider;
    redirectUri: string;
  }): { authUrl: string } {
    if (!PROVIDERS.includes(params.provider)) {
      throw new Error(`Unsupported email provider: ${params.provider}`);
    }
    const credentials = this.resolveCredentials(params.provider, params.userId);
    if (!credentials) {
      throw new Error(
        `${params.provider} is not configured. Add its OAuth client id/secret (env ` +
          `${params.provider === "gmail" ? "GMAIL" : "OUTLOOK"}_OAUTH_CLIENT_ID/SECRET or in Email settings).`,
      );
    }
    const state = randomBytes(24).toString("base64url");
    const { verifier, challenge } = createPkce();
    this.pending.set(state, {
      userId: params.userId,
      provider: params.provider,
      codeVerifier: verifier,
      redirectUri: params.redirectUri,
      createdAt: Date.now(),
    });
    this.gcPending();
    const authUrl = buildAuthorizeUrl({
      provider: params.provider,
      credentials,
      redirectUri: params.redirectUri,
      state,
      codeChallenge: challenge,
    });
    return { authUrl };
  }

  async completeConnect(params: { code: string; state: string }): Promise<EmailAccount> {
    const pending = this.pending.get(params.state);
    this.pending.delete(params.state);
    if (!pending || pending.createdAt < Date.now() - 10 * 60_000) {
      throw new Error("OAuth state is invalid or expired. Please retry connecting.");
    }

    const credentials = this.resolveCredentials(pending.provider, pending.userId);
    if (!credentials) throw new Error(`${pending.provider} OAuth credentials are no longer configured.`);

    const tokens = await exchangeCode({
      provider: pending.provider,
      credentials,
      redirectUri: pending.redirectUri,
      code: params.code,
      codeVerifier: pending.codeVerifier,
    });
    const email = await this.clients[pending.provider].getProfileEmail(tokens.accessToken);
    if (!email) throw new Error("Could not read the account email address from the provider.");

    const account = this.upsertAccount(pending.userId, pending.provider, email);
    this.storeTokens(account.id, pending.userId, tokens);
    return account;
  }

  // ── Account persistence ────────────────────────────────────────────

  listAccounts(userId: string | null): EmailAccount[] {
    return this.db
      .select()
      .from(emailAccounts)
      .where(userId ? eq(emailAccounts.userId, userId) : isNull(emailAccounts.userId))
      .orderBy(desc(emailAccounts.updatedAt))
      .all()
      .map(row => this.withAccountSettings(rowToAccount(row)));
  }

  getAccount(userId: string | null, accountId: string): EmailAccount | null {
    const row = this.db
      .select()
      .from(emailAccounts)
      .where(
        and(
          eq(emailAccounts.id, accountId),
          userId ? eq(emailAccounts.userId, userId) : isNull(emailAccounts.userId),
        ),
      )
      .get();
    return row ? this.withAccountSettings(rowToAccount(row)) : null;
  }

  /** Resolve an account by id, or fall back to the user's first account. */
  resolveAccount(userId: string | null, accountId?: string): EmailAccount {
    if (accountId) {
      const acct = this.getAccount(userId, accountId);
      if (!acct) throw new Error(`Email account ${accountId} not found.`);
      return acct;
    }
    const accounts = this.listAccounts(userId);
    if (accounts.length > 1) throw new Error("Multiple email accounts are connected. Specify accountId (use email_accounts to list them).");
    const first = accounts[0];
    if (!first) throw new Error("No email account connected. Add a mailbox on the Email page first.");
    return first;
  }

  disconnect(userId: string | null, accountId: string): boolean {
    const acct = this.getAccount(userId, accountId);
    if (!acct) return false;
    this.invalidateInbox(accountId);
    this.db.delete(emailAccounts).where(eq(emailAccounts.id, accountId)).run();
    const secretId = this.findTokenSecretId(userId, accountId);
    if (secretId) this.secrets.delete(secretId, userId);
    const settingsId = this.secrets.list(userId, "email-account-settings").find(item => item.key === accountId)?.id;
    if (settingsId) this.secrets.delete(settingsId, userId);
    return true;
  }

  async connectMailbox(userId: string | null, input: ConnectMailboxInput): Promise<EmailAccount> {
    const config = connectMailboxSchema.parse(input);
    // Verify credentials before saving anything; a failed attempt leaves existing accounts intact.
    try { await new ImapMailboxClient(config).verify(); }
    catch { throw new Error("Connection failed. Check server names, TLS, username and app password."); }
    const account = this.upsertAccount(userId, "imap", config.email.toLowerCase());
    this.secrets.save({ userId, type: TOKEN_SECRET_TYPE, key: account.id, label: "Mailbox credentials", value: JSON.stringify(config) });
    if (config.displayName) this.updateAccount(userId, account.id, { displayName: config.displayName });
    return this.getAccount(userId, account.id)!;
  }

  private withAccountSettings(account: EmailAccount): EmailAccount {
    let settings: EmailAccountSettings = {};
    try { settings = JSON.parse(this.secrets.getValue(account.userId, "email-account-settings", account.id) || "{}"); } catch { /* defaults */ }
    return { ...account, signature: typeof settings.signature === "string" ? settings.signature : "", signatureEnabled: settings.signatureEnabled !== false };
  }

  updateAccount(userId: string | null, accountId: string, input: EmailAccountSettings): EmailAccount {
    const account = this.getAccount(userId, accountId);
    if (!account) throw new Error("Account not found");
    const patch = emailAccountSettingsSchema.parse(input);
    const settings = { signature: patch.signature ?? account.signature ?? "", signatureEnabled: patch.signatureEnabled ?? account.signatureEnabled ?? true };
    this.secrets.save({ userId, type: "email-account-settings", key: accountId, label: "Email signature", value: JSON.stringify(settings) });
    if (patch.displayName !== undefined) this.db.update(emailAccounts).set({ displayName: patch.displayName }).where(eq(emailAccounts.id, accountId)).run();
    return this.getAccount(userId, accountId)!;
  }

  private async mailbox(account: EmailAccount): Promise<{ client: MailboxClient; token: string }> {
    if (account.provider === "imap") {
      const raw = this.secrets.getValue(account.userId, TOKEN_SECRET_TYPE, account.id);
      if (!raw) throw new Error("Reconnect this mailbox to restore its credentials");
      const config = connectMailboxSchema.parse(JSON.parse(raw));
      return { client: new ImapMailboxClient({ ...config, displayName: account.displayName }), token: "" };
    }
    return { client: this.clients[account.provider], token: await this.validAccessToken(account) };
  }

  private upsertAccount(userId: string | null, provider: EmailProvider, email: string): EmailAccount {
    const now = new Date().toISOString();
    const existing = this.db
      .select()
      .from(emailAccounts)
      .where(
        and(
          userId ? eq(emailAccounts.userId, userId) : isNull(emailAccounts.userId),
          eq(emailAccounts.provider, provider),
          eq(emailAccounts.email, email),
        ),
      )
      .get();
    if (existing) {
      this.db
        .update(emailAccounts)
        .set({ status: "connected", error: null, updatedAt: now })
        .where(eq(emailAccounts.id, existing.id))
        .run();
      return rowToAccount({ ...existing, status: "connected", error: null, updatedAt: now });
    }
    const id = uuidv7();
    const row = {
      id,
      userId: userId ?? null,
      provider,
      email,
      displayName: email,
      status: "connected",
      error: null as string | null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(emailAccounts).values(row).run();
    return rowToAccount(row);
  }

  // ── Token storage / refresh ────────────────────────────────────────

  private storeTokens(accountId: string, userId: string | null, tokens: EmailTokens): void {
    this.secrets.save({
      userId,
      type: TOKEN_SECRET_TYPE,
      key: accountId,
      label: `Email tokens (${accountId})`,
      value: JSON.stringify(tokens),
    });
  }

  private loadTokens(accountId: string, userId: string | null): EmailTokens | null {
    const raw = this.secrets.getValue(userId, TOKEN_SECRET_TYPE, accountId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as EmailTokens;
    } catch {
      return null;
    }
  }

  private findTokenSecretId(userId: string | null, accountId: string): string | null {
    const list = this.secrets.list(userId, TOKEN_SECRET_TYPE);
    return list.find((s) => s.key === accountId)?.id ?? null;
  }

  private async validAccessToken(account: EmailAccount): Promise<string> {
    const tokens = this.loadTokens(account.id, account.userId);
    if (!tokens) throw new Error("No stored credentials for this account. Reconnect it.");
    if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
    if (!tokens.refreshToken) throw new Error("Access token expired and no refresh token is available. Reconnect.");
    if (account.provider === "imap") throw new Error("IMAP accounts do not use OAuth tokens");
    const credentials = this.resolveCredentials(account.provider, account.userId);
    if (!credentials) throw new Error(`${account.provider} OAuth credentials are not configured.`);
    const refreshed = await refreshTokens({
      provider: account.provider,
      credentials,
      refreshToken: tokens.refreshToken,
    });
    this.storeTokens(account.id, account.userId, refreshed);
    return refreshed.accessToken;
  }

  // ── Provider-agnostic operations ───────────────────────────────────

  async listMessages(
    userId: string | null,
    accountId: string | undefined,
    opts: ListMessagesOptions,
  ): Promise<{ account: EmailAccount; messages: EmailMessageSummary[] }> {
    const account = this.resolveAccount(userId, accountId);
    const cacheable = (!opts.folder || opts.folder.toLowerCase() === "inbox") && !opts.query && opts.limit === 30;
    const generation = (this.inboxGeneration.get(account.id) ?? 0) + (cacheable ? 1 : 0);
    if (cacheable) this.inboxGeneration.set(account.id, generation);
    const { client, token } = await this.mailbox(account);
    const messages = await client.listMessages(token, opts);
    if (cacheable && generation === (this.inboxGeneration.get(account.id) ?? 0) && this.getAccount(userId, account.id)) this.inboxCache.set(account.id, messages);
    return { account, messages };
  }

  async getMessage(userId: string | null, accountId: string | undefined, id: string): Promise<EmailMessageFull> {
    const account = this.resolveAccount(userId, accountId);
    const { client, token } = await this.mailbox(account);
    return client.getMessage(token, id);
  }

  async sendMessage(userId: string | null, accountId: string | undefined, input: SendMessageInput): Promise<{ id: string }> {
    input = sendEmailSchema.parse(input);
    const account = this.resolveAccount(userId, accountId);
    const { client, token } = await this.mailbox(account);
    let body = input.body;
    const signature = account.signature?.trim();
    if (input.includeSignature !== false && account.signatureEnabled !== false && signature) {
      const escaped = signature.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\r?\n/g, "<br>");
      body += input.html ? "<br><br>-- <br>" + escaped : "\n\n-- \n" + signature;
    }
    return client.sendMessage(token, { ...input, body });
  }

  async tagMessage(
    userId: string | null,
    accountId: string | undefined,
    id: string,
    add: string[],
    remove: string[],
  ): Promise<void> {
    const account = this.resolveAccount(userId, accountId);
    const { client, token } = await this.mailbox(account);
    await client.tagMessage(token, id, add, remove);
    this.invalidateInbox(account.id);
  }

  async deleteMessage(userId: string | null, accountId: string | undefined, id: string): Promise<void> {
    const account = this.resolveAccount(userId, accountId);
    const { client, token } = await this.mailbox(account);
    await client.deleteMessage(token, id);
    this.invalidateInbox(account.id);
  }

  async listFolders(userId: string | null, accountId: string | undefined): Promise<EmailFolder[]> {
    const account = this.resolveAccount(userId, accountId);
    const { client, token } = await this.mailbox(account);
    return client.listFolders(token);
  }

  private gcPending(): void {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [state, p] of this.pending) {
      if (p.createdAt < cutoff) this.pending.delete(state);
    }
  }
}

function rowToAccount(row: typeof emailAccounts.$inferSelect): EmailAccount {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider as EmailProvider,
    email: row.email,
    displayName: row.displayName,
    status: row.status as "connected" | "error",
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
