import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase, type JaitDB } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import { UserSecretService } from "../user-secrets.js";
import { EmailService } from "./service.js";

let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;

beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
});

afterEach(() => {
  sqlite.close();
});

describe("EmailService", () => {
  it("reports providers as unconfigured until credentials are saved", () => {
    expect(service.configuredProviders("u1")).toEqual({ gmail: false, outlook: false });
    service.saveAppCredentials("u1", "gmail", { clientId: "cid", clientSecret: "secret" });
    expect(service.configuredProviders("u1")).toEqual({ gmail: true, outlook: false });
  });

  it("resolves env credentials as a fallback", () => {
    process.env["GMAIL_OAUTH_CLIENT_ID"] = "env-id";
    process.env["GMAIL_OAUTH_CLIENT_SECRET"] = "env-secret";
    expect(service.resolveCredentials("gmail", "u1")).toEqual({ clientId: "env-id", clientSecret: "env-secret" });
  });

  it("startConnect throws a helpful error when unconfigured", () => {
    expect(() => service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://x/cb" }))
      .toThrow(/not configured/i);
  });

  it("builds an authorize URL with PKCE + state when configured", () => {
    service.saveAppCredentials("u1", "gmail", { clientId: "cid", clientSecret: "secret" });
    const { authUrl } = service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://x/cb" });
    const url = new URL(authUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("http://x/cb");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("rejects an unknown OAuth state on callback", async () => {
    await expect(service.completeConnect({ code: "c", state: "nope" })).rejects.toThrow(/invalid or expired/i);
  });

  it("disconnecting an account removes it and its stored tokens", () => {
    // Seed an account row + token secret the way completeConnect would.
    const account = (service as unknown as {
      upsertAccount: (u: string, p: string, e: string) => { id: string };
    }).upsertAccount("u1", "gmail", "me@gmail.com");
    (service as unknown as {
      storeTokens: (id: string, u: string, t: unknown) => void;
    }).storeTokens(account.id, "u1", { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1e6 });

    expect(service.listAccounts("u1")).toHaveLength(1);
    expect(secrets.list("u1", "email-account")).toHaveLength(1);

    expect(service.disconnect("u1", account.id)).toBe(true);
    expect(service.listAccounts("u1")).toHaveLength(0);
    expect(secrets.list("u1", "email-account")).toHaveLength(0);
  });

  it("scopes accounts to the owning user", () => {
    (service as unknown as { upsertAccount: (u: string, p: string, e: string) => unknown }).upsertAccount("u1", "gmail", "a@gmail.com");
    (service as unknown as { upsertAccount: (u: string, p: string, e: string) => unknown }).upsertAccount("u2", "gmail", "b@gmail.com");
    expect(service.listAccounts("u1").map((a) => a.email)).toEqual(["a@gmail.com"]);
    expect(service.listAccounts("u2").map((a) => a.email)).toEqual(["b@gmail.com"]);
  });
});
