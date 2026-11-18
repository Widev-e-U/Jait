import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { openDatabase, migrateDatabase } from "../db/connection.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import type { AppConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import { UserSecretService } from "../services/user-secrets.js";
import { EmailService } from "../services/email/service.js";
import { ImapMailboxClient } from "../services/email/imap.js";
import { registerEmailRoutes } from "./email.js";

let app: FastifyInstance;
let sqlite: SqliteDatabase;
let email: EmailService;
let headers: Record<string, string>;
let accountId: string;
beforeEach(async () => {
  const opened = await openDatabase(":memory:"); sqlite = opened.sqlite; migrateDatabase(sqlite);
  email = new EmailService(opened.db, new UserSecretService(opened.db, "test-secret"));
  const internal = email as unknown as { upsertAccount(u: string, p: string, e: string): { id: string } };
  accountId = internal.upsertAccount("owner", "gmail", "owner@example.com").id;
  headers = { authorization: "Bearer " + await signAuthToken({ id: "owner", username: "owner" }, "test-jwt") };
  app = Fastify();
  registerEmailRoutes(app, { jwtSecret: "test-jwt" } as AppConfig, email);
});
afterEach(async () => { await app.close(); sqlite.close(); vi.restoreAllMocks(); });
describe("email account routes", () => {
  it.each([
    ["GET", "/api/email/accounts"], ["GET", "/api/email/discover?email=x@example.com"],
    ["POST", "/api/email/accounts"], ["PATCH", "/api/email/accounts/id"], ["POST", "/api/email/images"],
  ])("requires authentication for %s %s", async (method, url) => {
    expect((await app.inject({ method: method as "GET", url })).statusCode).toBe(401);
  });
  it("persists signature settings without accepting arbitrary account fields", async () => {
    const updated = await app.inject({ method: "PATCH", url: "/api/email/accounts/" + accountId, headers, payload: { signature: "Team signature", signatureEnabled: true } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().account.signature).toBe("Team signature");
    expect((await app.inject({ method: "GET", url: "/api/email/accounts", headers })).json().accounts[0].signature).toBe("Team signature");
    expect((await app.inject({ method: "PATCH", url: "/api/email/accounts/" + accountId, headers, payload: { userId: "another-user", signature: "override" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/api/email/accounts/" + accountId, headers, payload: { signature: "x".repeat(10001) } })).statusCode).toBe(400);
  });
  it("cannot read, modify, disconnect or request images through another user's account", async () => {
    const foreign = await signAuthToken({ id: "other-user", username: "other" }, "test-jwt");
    const foreignHeaders = { authorization: "Bearer " + foreign };
    for (const request of [
      { method: "PATCH", url: "/api/email/accounts/" + accountId, payload: { signature: "intruder" } },
      { method: "DELETE", url: "/api/email/accounts/" + accountId },
      { method: "POST", url: "/api/email/images", payload: { accountId, urls: ["https://images.example.com/a.png"] } },
    ]) expect((await app.inject({ ...request, method: request.method as "POST", headers: foreignHeaders })).statusCode).toBe(404);
    const read = await app.inject({ method: "GET", url: "/api/email/messages/id?accountId=" + accountId, headers: foreignHeaders });
    expect(read.statusCode).toBe(400);
    expect(read.json().error).toMatch(/not found/);
  });
  it("validates mailbox credentials and returns only safe metadata after verification", async () => {
    vi.spyOn(ImapMailboxClient.prototype, "verify").mockResolvedValue();
    const server = { host: "mail.example.com", port: 993, secure: true, user: "me@example.com", password: "test-only-password" };
    const response = await app.inject({ method: "POST", url: "/api/email/accounts", headers, payload: { email: "me@example.com", imap: server, smtp: { ...server, port: 465 } } });
    expect(response.statusCode).toBe(200);
    expect(response.json().account.provider).toBe("imap");
    expect(response.body).not.toContain("test-only-password");
    expect((await app.inject({ method: "POST", url: "/api/email/accounts", headers, payload: { email: "me@example.com", imap: { ...server, port: -1 }, smtp: server } })).statusCode).toBe(400);
  });
  it("does not expose submitted credentials when connection verification fails", async () => {
    vi.spyOn(ImapMailboxClient.prototype, "verify").mockRejectedValue(new Error("password: do-not-return"));
    const server = { host: "mail.example.com", port: 993, secure: true, user: "me", password: "do-not-return" };
    const response = await app.inject({ method: "POST", url: "/api/email/accounts", headers, payload: { email: "me@example.com", imap: server, smtp: server } });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("do-not-return");
    expect(email.listAccounts("owner")).toHaveLength(1);
  });
});
