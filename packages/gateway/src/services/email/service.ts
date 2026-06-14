// EmailService — orchestrates connected mailboxes: OAuth connect flow,
// account persistence, token storage/refresh, and provider-agnostic ops.

import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { JaitDB } from "../../db/connection.js";
import { emailAccounts } from "../../db/schema.js";
import { uuidv7 } from "../../db/uuidv7.js";
import type { UserSecretService } from "../user-secrets.js";
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
const PROVIDERS: EmailProvider[] = ["gmail", "outlook"];

interface PendingConnect {
  userId: string | null;
  provider: EmailProvider;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export class EmailService {
  private readonly clients: Record<EmailProvider, MailboxClient> = {
    gmail: new GmailClient(),
    outlook: new OutlookClient(),
  };
  private readonly pending = new Map<string, PendingConnect>();

  constructor(
    private readonly db: JaitDB,
    private readonly secrets: UserSecretService,
  ) {}

  // ── OAuth client credentials ───────────────────────────────────────

  /** Resolve OAuth app credentials: per-user secret first, then env. */
  resolveCredentials(provider: EmailProvider, userId: string | null): OAuthClientCredentials | null {
    const clientId = this.secrets.getValue(userId, APP_SECRET_TYPE, `${provider}-client-id`);
    const clientSecret = this.secrets.getValue(userId, APP_SECRET_TYPE, `${provider}-client-secret`);
    if (clientId && clientSecret) return { clientId, clientSecret };
    return envClientCredentials(provider);
  }

  /** Which providers are ready to connect (have OAuth app credentials). */
  configuredProviders(userId: string | null): Record<EmailProvider, boolean> {
    return {
      gmail: !!this.resolveCredentials("gmail", userId),
      outlook: !!this.resolveCredentials("outlook", userId),
    };
  }

  saveAppCredentials(userId: string | null, provider: EmailProvider, creds: OAuthClientCredentials): void {
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
    provider: EmailProvider;
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
    if (!pending) throw new Error("OAuth state is invalid or expired. Please retry connecting.");
    this.pending.delete(params.state);

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
      .map(rowToAccount);
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
    return row ? rowToAccount(row) : null;
  }

  /** Resolve an account by id, or fall back to the user's first account. */
  resolveAccount(userId: string | null, accountId?: string): EmailAccount {
    if (accountId) {
      const acct = this.getAccount(userId, accountId);
      if (!acct) throw new Error(`Email account ${accountId} not found.`);
      return acct;
    }
    const accounts = this.listAccounts(userId);
    const first = accounts[0];
    if (!first) throw new Error("No email account connected. Connect Gmail or Outlook first.");
    return first;
  }

  disconnect(userId: string | null, accountId: string): boolean {
    const acct = this.getAccount(userId, accountId);
    if (!acct) return false;
    this.db.delete(emailAccounts).where(eq(emailAccounts.id, accountId)).run();
    const secretId = this.findTokenSecretId(userId, accountId);
    if (secretId) this.secrets.delete(secretId, userId);
    return true;
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
    const token = await this.validAccessToken(account);
    const messages = await this.clients[account.provider].listMessages(token, opts);
    return { account, messages };
  }

  async getMessage(userId: string | null, accountId: string | undefined, id: string): Promise<EmailMessageFull> {
    const account = this.resolveAccount(userId, accountId);
    const token = await this.validAccessToken(account);
    return this.clients[account.provider].getMessage(token, id);
  }

  async sendMessage(userId: string | null, accountId: string | undefined, input: SendMessageInput): Promise<{ id: string }> {
    const account = this.resolveAccount(userId, accountId);
    const token = await this.validAccessToken(account);
    return this.clients[account.provider].sendMessage(token, input);
  }

  async tagMessage(
    userId: string | null,
    accountId: string | undefined,
    id: string,
    add: string[],
    remove: string[],
  ): Promise<void> {
    const account = this.resolveAccount(userId, accountId);
    const token = await this.validAccessToken(account);
    await this.clients[account.provider].tagMessage(token, id, add, remove);
  }

  async deleteMessage(userId: string | null, accountId: string | undefined, id: string): Promise<void> {
    const account = this.resolveAccount(userId, accountId);
    const token = await this.validAccessToken(account);
    await this.clients[account.provider].deleteMessage(token, id);
  }

  async listFolders(userId: string | null, accountId: string | undefined): Promise<EmailFolder[]> {
    const account = this.resolveAccount(userId, accountId);
    const token = await this.validAccessToken(account);
    return this.clients[account.provider].listFolders(token);
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
