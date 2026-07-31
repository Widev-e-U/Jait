import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase, type JaitDB } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import { UserSecretService } from "../user-secrets.js";
import { CalendarService } from "./service.js";

let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;

beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
});

afterEach(() => {
  sqlite.close();
});

describe("CalendarService", () => {
  it("reports whether Google OAuth is configured", () => {
    expect(service.isConfigured("u1")).toBe(false);
    service.saveAppCredentials("u1", { clientId: "calendar-id", clientSecret: "calendar-secret" });
    expect(service.isConfigured("u1")).toBe(true);
  });

  it("reuses the user's Gmail OAuth app credentials", () => {
    secrets.save({
      userId: "u1",
      type: "email-oauth-app",
      key: "gmail-client-id",
      label: "Gmail client id",
      value: "gmail-id",
    });
    secrets.save({
      userId: "u1",
      type: "email-oauth-app",
      key: "gmail-client-secret",
      label: "Gmail client secret",
      value: "gmail-secret",
    });
    expect(service.resolveCredentials("u1")).toEqual({ clientId: "gmail-id", clientSecret: "gmail-secret" });
  });

  it("builds a read-only Google Calendar authorization URL", () => {
    service.saveAppCredentials("u1", { clientId: "calendar-id", clientSecret: "calendar-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", redirectUri: "https://jait.test/api/calendar/oauth/callback" });
    const url = new URL(authUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("calendar-id");
    expect(url.searchParams.get("scope")).toContain("calendar.readonly");
    expect(url.searchParams.get("scope")).not.toContain("calendar.events");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("rejects an unknown OAuth callback state", async () => {
    await expect(service.completeConnect({ code: "code", state: "unknown" })).rejects.toThrow(/invalid or expired/i);
  });

  it("scopes accounts to their owner and removes stored tokens on disconnect", () => {
    const privateService = service as unknown as {
      upsertAccount: (userId: string, email: string) => { id: string };
      storeTokens: (accountId: string, userId: string, tokens: unknown) => void;
    };
    const first = privateService.upsertAccount("u1", "one@example.com");
    privateService.upsertAccount("u2", "two@example.com");
    privateService.storeTokens(first.id, "u1", {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
    });

    expect(service.listAccounts("u1").map((account) => account.email)).toEqual(["one@example.com"]);
    expect(service.listAccounts("u2").map((account) => account.email)).toEqual(["two@example.com"]);
    expect(secrets.list("u1", "calendar-account")).toHaveLength(1);
    expect(service.disconnect("u1", first.id)).toBe(true);
    expect(service.listAccounts("u1")).toHaveLength(0);
    expect(secrets.list("u1", "calendar-account")).toHaveLength(0);
  });

  it("persists, filters, and removes Android calendar snapshots", async () => {
    const account = service.syncDeviceCalendar("u1", {
      deviceId: "phone-1",
      deviceName: "Samsung Galaxy",
      calendars: [{
        id: "7",
        name: "Samsung Calendar",
        description: "com.samsung.android.calendar",
        timeZone: "Europe/Berlin",
        primary: true,
        selected: true,
        accessRole: "reader",
      }],
      events: [{
        id: "event-1",
        calendarId: "7",
        calendarName: "Samsung Calendar",
        title: "Early shift",
        description: "",
        location: "Office",
        start: "2026-08-02T05:00:00.000Z",
        end: "2026-08-02T13:00:00.000Z",
        allDay: false,
        status: "confirmed",
        organizer: "",
        attendees: [],
      }],
    });

    expect(account).toMatchObject({ provider: "android", displayName: "Samsung Galaxy" });
    await expect(service.listCalendars("u1", account.id)).resolves.toMatchObject({
      calendars: [expect.objectContaining({ name: "Samsung Calendar" })],
    });
    await expect(service.listEvents("u1", account.id, {
      timeMin: "2026-08-01T00:00:00.000Z",
      timeMax: "2026-08-03T00:00:00.000Z",
      query: "office",
    })).resolves.toMatchObject({
      events: [expect.objectContaining({ title: "Early shift" })],
    });
    expect(service.disconnect("u1", account.id)).toBe(true);
    expect(service.listAccounts("u1")).toHaveLength(0);
  });
});
