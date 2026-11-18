import { GmailClient } from "./gmail.js";
import { ImapMailboxClient } from "./imap.js";
import { userSecrets } from "../../db/schema.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
  sqlite.close();
});

describe("EmailService", () => {
  it("caches inbox summaries per owner and invalidates them after changes", async () => {
    const account = (service as unknown as { upsertAccount: (u: string, p: string, e: string) => { id: string } }).upsertAccount("u1", "gmail", "me@gmail.com");
    (service as unknown as { storeTokens: (id: string, u: string, t: unknown) => void }).storeTokens(account.id, "u1", { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1e6 });
    const messages = [{ id: "one" }] as Awaited<ReturnType<GmailClient["listMessages"]>>;
    vi.spyOn(GmailClient.prototype, "listMessages").mockResolvedValue(messages);
    vi.spyOn(GmailClient.prototype, "deleteMessage").mockResolvedValue();
    expect(service.cachedInbox("u1", account.id)).toBeNull();
    await service.listMessages("u1", account.id, { folder: "inbox", limit: 30 });
    expect(service.cachedInbox("u1", account.id)).toEqual(messages);
    expect(() => service.cachedInbox("u2", account.id)).toThrow();
    await service.deleteMessage("u1", account.id, "one");
    expect(service.cachedInbox("u1", account.id)).toBeNull();
  });

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

function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
describe("multiple mailboxes and signatures", () => {
  it("keeps accounts distinct and requires an explicit id when there is more than one", () => {
    const personal = seedMailbox("u1", "personal@gmail.com");
    const work = seedMailbox("u1", "work@gmail.com");
    expect(service.listAccounts("u1")).toHaveLength(2);
    expect(service.resolveAccount("u1", personal.id).email).toBe("personal@gmail.com");
    expect(service.resolveAccount("u1", work.id).email).toBe("work@gmail.com");
    expect(() => service.resolveAccount("u1")).toThrow(/Specify accountId/);
    expect(() => service.resolveAccount("u2", personal.id)).toThrow(/not found/);
  });
  it("appends each account's signature once to new messages and replies", async () => {
    const first = seedMailbox("u1", "first@gmail.com");
    const second = seedMailbox("u1", "second@gmail.com");
    service.updateAccount("u1", first.id, { signature: "Alice\nPersonal" });
    service.updateAccount("u1", second.id, { signature: "Alice\nWork" });
    const send = vi.spyOn(GmailClient.prototype, "sendMessage").mockResolvedValue({ id: "sent" });
    await service.sendMessage("u1", first.id, { to: "to@example.com", subject: "Hi", body: "Hello" });
    expect(send.mock.calls[0][1].body).toBe("Hello\n\n-- \nAlice\nPersonal");
    await service.sendMessage("u1", second.id, { to: "to@example.com", subject: "Re: Hi", body: "Reply", replyToMessageId: "original" });
    expect(send.mock.calls[1][1]).toMatchObject({ replyToMessageId: "original", body: "Reply\n\n-- \nAlice\nWork" });
  });
  it("escapes signatures for HTML and supports both per-send and per-account opt out", async () => {
    const account = seedMailbox("u1", "me@gmail.com");
    service.updateAccount("u1", account.id, { signature: '<img src=x onerror="bad()"> & team' });
    const send = vi.spyOn(GmailClient.prototype, "sendMessage").mockResolvedValue({ id: "sent" });
    await service.sendMessage("u1", account.id, { to: "to@example.com", subject: "Hi", body: "<p>Hi</p>", html: true });
    expect(send.mock.calls[0][1].body).toContain("&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; team");
    await service.sendMessage("u1", account.id, { to: "to@example.com", subject: "Hi", body: "Hello", includeSignature: false });
    expect(send.mock.calls[1][1].body).toBe("Hello");
    service.updateAccount("u1", account.id, { signatureEnabled: false });
    await service.sendMessage("u1", account.id, { to: "to@example.com", subject: "Hi", body: "Hello" });
    expect(send.mock.calls[2][1].body).toBe("Hello");
  });
  it("scopes signature changes and deletes settings on disconnect", () => {
    const account = seedMailbox("u1", "me@gmail.com");
    expect(() => service.updateAccount("u2", account.id, { signature: "Intruder" })).toThrow(/not found/);
    service.updateAccount("u1", account.id, { signature: "Private signature" });
    expect(service.getAccount("u1", account.id)?.signature).toBe("Private signature");
    expect(JSON.stringify(db.select().from(userSecrets).all())).not.toContain("Private signature");
    service.disconnect("u1", account.id);
    expect(secrets.list("u1", "email-account-settings")).toHaveLength(0);
  });
  it("verifies IMAP/SMTP before storing encrypted credentials and never exposes them in account metadata", async () => {
    const verify = vi.spyOn(ImapMailboxClient.prototype, "verify").mockResolvedValue();
    const config = { email: "me@example.com", imap: { host: "imap.example.com", port: 993, secure: true, user: "me", password: "private-mail-password" }, smtp: { host: "smtp.example.com", port: 465, secure: true, user: "me", password: "private-smtp-password" } };
    const account = await service.connectMailbox("u1", config);
    expect(verify).toHaveBeenCalledOnce();
    expect(account.provider).toBe("imap");
    expect(JSON.stringify(service.listAccounts("u1"))).not.toContain("private-mail-password");
    expect(JSON.stringify(db.select().from(userSecrets).all())).not.toContain("private-mail-password");
    const stored = secrets.getValue("u1", "email-account", account.id);
    verify.mockRejectedValue(new Error("authentication failed"));
    await expect(service.connectMailbox("u1", { ...config, imap: { ...config.imap, password: "wrong" } })).rejects.toThrow(/Connection failed/);
    expect(secrets.getValue("u1", "email-account", account.id)).toBe(stored);
  });
});

it("rejects header injection and malformed send flags before provider access", async () => {
  const account = seedMailbox("u1", "me@gmail.com");
  const send = vi.spyOn(GmailClient.prototype, "sendMessage").mockResolvedValue({ id: "sent" });
  await expect(service.sendMessage("u1", account.id, { to: "person@example.com", subject: "Hello\r\nBcc: victim@example.com", body: "Text" })).rejects.toThrow();
  await expect(service.sendMessage("u1", account.id, { to: "person@example.com", subject: "Hello", body: "Text", html: "true" as unknown as boolean })).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});

it("rejects expired OAuth state before exchanging tokens and consumes it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const started = new Date("2026-10-20T12:00:00.000Z");
  const fetchMock = vi.fn(async () => Response.json({ error: "synthetic_expired_fixture" }, { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    vi.setSystemTime(started);
    service.saveAppCredentials("u1", "gmail", { clientId: "synthetic-client", clientSecret: "synthetic-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://fixture.invalid/callback" });
    const state = new URL(authUrl).searchParams.get("state")!;
    vi.setSystemTime(new Date(started.getTime() + 10 * 60_000 + 1));
    await expect(service.completeConnect({ code: "synthetic-code", state })).rejects.toThrow(/invalid or expired/i);
    vi.setSystemTime(started);
    await expect(service.completeConnect({ code: "synthetic-code", state })).rejects.toThrow(/invalid or expired/i);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it("preserves the OAuth expiry boundary and rejects a repeated callback", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const started = new Date("2026-10-20T12:00:00.000Z");
  const fetchMock = vi.fn(async () => Response.json({ error: "synthetic_boundary_fixture" }, { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    vi.setSystemTime(started);
    service.saveAppCredentials("u1", "gmail", { clientId: "synthetic-client", clientSecret: "synthetic-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://fixture.invalid/callback" });
    const state = new URL(authUrl).searchParams.get("state")!;
    vi.setSystemTime(new Date(started.getTime() + 10 * 60_000));
    await expect(service.completeConnect({ code: "synthetic-code", state })).rejects.toThrow("OAuth token request failed: synthetic_boundary_fixture");
    await expect(service.completeConnect({ code: "synthetic-code", state })).rejects.toThrow(/invalid or expired/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
