import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { JaitDB } from "../../db/connection.js";
import { calendarAccounts, deviceCalendarSnapshots } from "../../db/schema.js";
import { uuidv7 } from "../../db/uuidv7.js";
import type { UserSecretService } from "../user-secrets.js";
import { GoogleCalendarClient } from "./google.js";
import {
  buildCalendarAuthorizeUrl,
  createCalendarPkce,
  envCalendarCredentials,
  exchangeCalendarCode,
  refreshCalendarTokens,
  type CalendarOAuthCredentials,
} from "./oauth.js";
import type {
  CalendarAccount,
  CalendarEvent,
  CalendarInfo,
  CalendarTokens,
  DeviceCalendarSnapshot,
  ListCalendarEventsOptions,
} from "./types.js";

const TOKEN_SECRET_TYPE = "calendar-account";
const APP_SECRET_TYPE = "calendar-oauth-app";
const EMAIL_APP_SECRET_TYPE = "email-oauth-app";

interface PendingConnect {
  userId: string | null;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export class CalendarService {
  private readonly client = new GoogleCalendarClient();
  private readonly pending = new Map<string, PendingConnect>();

  constructor(
    private readonly db: JaitDB,
    private readonly secrets: UserSecretService,
  ) {}

  resolveCredentials(userId: string | null): CalendarOAuthCredentials | null {
    const ownClientId = this.secrets.getValue(userId, APP_SECRET_TYPE, "google-client-id");
    const ownClientSecret = this.secrets.getValue(userId, APP_SECRET_TYPE, "google-client-secret");
    if (ownClientId && ownClientSecret) return { clientId: ownClientId, clientSecret: ownClientSecret };

    const emailClientId = this.secrets.getValue(userId, EMAIL_APP_SECRET_TYPE, "gmail-client-id");
    const emailClientSecret = this.secrets.getValue(userId, EMAIL_APP_SECRET_TYPE, "gmail-client-secret");
    if (emailClientId && emailClientSecret) return { clientId: emailClientId, clientSecret: emailClientSecret };
    return envCalendarCredentials();
  }

  isConfigured(userId: string | null): boolean {
    return this.resolveCredentials(userId) !== null;
  }

  saveAppCredentials(userId: string | null, credentials: CalendarOAuthCredentials): void {
    this.secrets.save({
      userId,
      type: APP_SECRET_TYPE,
      key: "google-client-id",
      label: "Google Calendar OAuth client id",
      value: credentials.clientId,
    });
    this.secrets.save({
      userId,
      type: APP_SECRET_TYPE,
      key: "google-client-secret",
      label: "Google Calendar OAuth client secret",
      value: credentials.clientSecret,
    });
  }

  startConnect(params: { userId: string | null; redirectUri: string }): { authUrl: string } {
    const credentials = this.resolveCredentials(params.userId);
    if (!credentials) {
      throw new Error(
        "Google Calendar is not configured. Add OAuth credentials in Calendar settings or configure Gmail OAuth first.",
      );
    }
    const state = randomBytes(24).toString("base64url");
    const { verifier, challenge } = createCalendarPkce();
    this.pending.set(state, {
      userId: params.userId,
      codeVerifier: verifier,
      redirectUri: params.redirectUri,
      createdAt: Date.now(),
    });
    this.gcPending();
    return {
      authUrl: buildCalendarAuthorizeUrl({
        credentials,
        redirectUri: params.redirectUri,
        state,
        codeChallenge: challenge,
      }),
    };
  }

  async completeConnect(params: { code: string; state: string }): Promise<CalendarAccount> {
    const pending = this.pending.get(params.state);
    if (!pending) throw new Error("OAuth state is invalid or expired. Please retry connecting.");
    this.pending.delete(params.state);
    const credentials = this.resolveCredentials(pending.userId);
    if (!credentials) throw new Error("Google Calendar OAuth credentials are no longer configured.");

    const tokens = await exchangeCalendarCode({
      credentials,
      redirectUri: pending.redirectUri,
      code: params.code,
      codeVerifier: pending.codeVerifier,
    });
    const email = await this.client.getProfileEmail(tokens.accessToken);
    if (!email) throw new Error("Could not read the Google account email address.");
    const account = this.upsertAccount(pending.userId, email);
    this.storeTokens(account.id, pending.userId, tokens);
    return account;
  }

  listAccounts(userId: string | null): CalendarAccount[] {
    return this.db
      .select()
      .from(calendarAccounts)
      .where(userId ? eq(calendarAccounts.userId, userId) : isNull(calendarAccounts.userId))
      .orderBy(desc(calendarAccounts.updatedAt))
      .all()
      .map(rowToAccount);
  }

  syncDeviceCalendar(userId: string | null, snapshot: DeviceCalendarSnapshot): CalendarAccount {
    const now = new Date().toISOString();
    const email = `device:${snapshot.deviceId}`;
    const existing = this.db.select().from(calendarAccounts).where(and(
      userId ? eq(calendarAccounts.userId, userId) : isNull(calendarAccounts.userId),
      eq(calendarAccounts.provider, "android"),
      eq(calendarAccounts.email, email),
    )).get();
    const accountId = existing?.id ?? uuidv7();
    const row = {
      id: accountId,
      userId,
      provider: "android",
      email,
      displayName: snapshot.deviceName || "Android device",
      status: "connected",
      error: null as string | null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) this.db.update(calendarAccounts).set(row).where(eq(calendarAccounts.id, accountId)).run();
    else this.db.insert(calendarAccounts).values(row).run();
    this.db.insert(deviceCalendarSnapshots).values({
      accountId,
      userId,
      calendars: JSON.stringify(snapshot.calendars),
      events: JSON.stringify(snapshot.events),
      syncedAt: now,
    }).onConflictDoUpdate({
      target: deviceCalendarSnapshots.accountId,
      set: { calendars: JSON.stringify(snapshot.calendars), events: JSON.stringify(snapshot.events), syncedAt: now },
    }).run();
    return rowToAccount(row);
  }

  getAccount(userId: string | null, accountId: string): CalendarAccount | null {
    const row = this.db
      .select()
      .from(calendarAccounts)
      .where(and(
        eq(calendarAccounts.id, accountId),
        userId ? eq(calendarAccounts.userId, userId) : isNull(calendarAccounts.userId),
      ))
      .get();
    return row ? rowToAccount(row) : null;
  }

  resolveAccount(userId: string | null, accountId?: string): CalendarAccount {
    if (accountId) {
      const account = this.getAccount(userId, accountId);
      if (!account) throw new Error(`Calendar account ${accountId} not found.`);
      return account;
    }
    const account = this.listAccounts(userId)[0];
    if (!account) throw new Error("No calendar account connected. Connect Google Calendar first.");
    return account;
  }

  disconnect(userId: string | null, accountId: string): boolean {
    const account = this.getAccount(userId, accountId);
    if (!account) return false;
    this.db.delete(deviceCalendarSnapshots).where(eq(deviceCalendarSnapshots.accountId, accountId)).run();
    this.db.delete(calendarAccounts).where(eq(calendarAccounts.id, accountId)).run();
    const secretId = this.secrets.list(userId, TOKEN_SECRET_TYPE).find((secret) => secret.key === accountId)?.id;
    if (secretId) this.secrets.delete(secretId, userId);
    return true;
  }

  async listCalendars(userId: string | null, accountId?: string): Promise<{
    account: CalendarAccount;
    calendars: CalendarInfo[];
  }> {
    const account = this.resolveAccount(userId, accountId);
    if (account.provider === "android") {
      return { account, calendars: this.loadDeviceSnapshot(account.id).calendars };
    }
    const accessToken = await this.validAccessToken(account);
    return { account, calendars: await this.client.listCalendars(accessToken) };
  }

  async listEvents(userId: string | null, accountId: string | undefined, options: ListCalendarEventsOptions = {}): Promise<{
    account: CalendarAccount;
    events: CalendarEvent[];
  }> {
    const account = this.resolveAccount(userId, accountId);
    if (account.provider === "android") {
      const now = new Date();
      const timeMin = normalizeDate(options.timeMin, now).toISOString();
      const timeMax = normalizeDate(options.timeMax, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)).toISOString();
      if (timeMax <= timeMin) throw new Error("timeMax must be after timeMin.");
      const query = options.query?.trim().toLowerCase();
      const limit = Math.max(1, Math.min(options.limit ?? 50, 250));
      const events = this.loadDeviceSnapshot(account.id).events
        .filter((event) => !options.calendarId || event.calendarId === options.calendarId)
        .filter((event) => event.end >= timeMin && event.start <= timeMax)
        .filter((event) => !query || `${event.title} ${event.description} ${event.location}`.toLowerCase().includes(query))
        .sort((left, right) => left.start.localeCompare(right.start))
        .slice(0, limit);
      return { account, events };
    }
    const accessToken = await this.validAccessToken(account);
    const now = new Date();
    const timeMin = normalizeDate(options.timeMin, now).toISOString();
    const defaultEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const timeMax = normalizeDate(options.timeMax, defaultEnd).toISOString();
    if (timeMax <= timeMin) throw new Error("timeMax must be after timeMin.");
    const limit = Math.max(1, Math.min(options.limit ?? 50, 250));

    const calendars = await this.client.listCalendars(accessToken);
    const targets = options.calendarId
      ? calendars.filter((calendar) => calendar.id === options.calendarId)
      : calendars.filter((calendar) => calendar.selected || calendar.primary);
    if (options.calendarId && targets.length === 0) throw new Error(`Calendar ${options.calendarId} not found.`);

    const batches = await Promise.all(targets.map((calendar) => this.client.listEvents(accessToken, calendar, {
      timeMin,
      timeMax,
      query: options.query,
      limit,
    })));
    const events = batches
      .flat()
      .filter((event) => event.status !== "cancelled")
      .sort((left, right) => left.start.localeCompare(right.start))
      .slice(0, limit);
    return { account, events };
  }

  private upsertAccount(userId: string | null, email: string): CalendarAccount {
    const now = new Date().toISOString();
    const existing = this.db
      .select()
      .from(calendarAccounts)
      .where(and(
        userId ? eq(calendarAccounts.userId, userId) : isNull(calendarAccounts.userId),
        eq(calendarAccounts.provider, "google"),
        eq(calendarAccounts.email, email),
      ))
      .get();
    if (existing) {
      this.db.update(calendarAccounts)
        .set({ status: "connected", error: null, updatedAt: now })
        .where(eq(calendarAccounts.id, existing.id))
        .run();
      return rowToAccount({ ...existing, status: "connected", error: null, updatedAt: now });
    }
    const row = {
      id: uuidv7(),
      userId,
      provider: "google",
      email,
      displayName: email,
      status: "connected",
      error: null as string | null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(calendarAccounts).values(row).run();
    return rowToAccount(row);
  }

  private storeTokens(accountId: string, userId: string | null, tokens: CalendarTokens): void {
    this.secrets.save({
      userId,
      type: TOKEN_SECRET_TYPE,
      key: accountId,
      label: `Calendar tokens (${accountId})`,
      value: JSON.stringify(tokens),
    });
  }

  private loadTokens(accountId: string, userId: string | null): CalendarTokens | null {
    const raw = this.secrets.getValue(userId, TOKEN_SECRET_TYPE, accountId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CalendarTokens;
    } catch {
      return null;
    }
  }

  private async validAccessToken(account: CalendarAccount): Promise<string> {
    const tokens = this.loadTokens(account.id, account.userId);
    if (!tokens) throw new Error("No stored credentials for this calendar account. Reconnect it.");
    if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
    if (!tokens.refreshToken) throw new Error("Calendar access expired. Reconnect the account.");
    const credentials = this.resolveCredentials(account.userId);
    if (!credentials) throw new Error("Google Calendar OAuth credentials are not configured.");
    const refreshed = await refreshCalendarTokens({ credentials, refreshToken: tokens.refreshToken });
    this.storeTokens(account.id, account.userId, refreshed);
    return refreshed.accessToken;
  }

  private loadDeviceSnapshot(accountId: string): { calendars: CalendarInfo[]; events: CalendarEvent[] } {
    const row = this.db.select().from(deviceCalendarSnapshots)
      .where(eq(deviceCalendarSnapshots.accountId, accountId)).get();
    if (!row) return { calendars: [], events: [] };
    try {
      return {
        calendars: JSON.parse(row.calendars) as CalendarInfo[],
        events: JSON.parse(row.events) as CalendarEvent[],
      };
    } catch {
      return { calendars: [], events: [] };
    }
  }

  private gcPending(): void {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [state, pending] of this.pending) {
      if (pending.createdAt < cutoff) this.pending.delete(state);
    }
  }
}

function normalizeDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function rowToAccount(row: typeof calendarAccounts.$inferSelect): CalendarAccount {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider === "android" ? "android" : "google",
    email: row.email,
    displayName: row.displayName,
    status: row.status === "error" ? "error" : "connected",
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
