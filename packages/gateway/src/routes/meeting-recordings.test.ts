import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMeetingRecordingApi } from "../../../api-client/src/meeting-recordings.js";
import { migrateDatabase, openDatabase, type SqliteDatabase } from "../db/connection.js";
import { meetingEndpoint } from "../meetings/endpoints.js";
import { signAuthToken } from "../security/http-auth.js";
import { UserSecretService } from "../services/user-secrets.js";
import { UserService } from "../services/users.js";
import { registerMeetingRecordingRoutes } from "./meeting-recordings.js";

const jwtSecret = "meeting-test-private-key";
const settings = { parakeetUrl: "http://127.0.0.1:18170", nemotronUrl: "http://127.0.0.1:18172/v1",
  nemotronModel: "nemotron", obsidianUrl: "http://127.0.0.1:18171", obsidianVault: "Test vault", obsidianToken: "test-token" };

describe("meeting recording routes", () => {
  let sqlite: SqliteDatabase;
  let users: UserService;
  let secrets: UserSecretService;
  let app: FastifyInstance;
  let ownerToken: string;
  let guestToken: string;

  function createApp() {
    const server = Fastify();
    registerMeetingRecordingRoutes(server, jwtSecret, users, secrets, sqlite);
    return server;
  }

  const client = (token = ownerToken) => createMeetingRecordingApi(async (path, init) => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const method = init?.method as "GET" | "POST" | "PUT" | "DELETE";
    const result = await app.inject({ method, url: path, headers: Object.fromEntries(headers), payload: init?.body as string | undefined });
    return new Response(result.body, { status: result.statusCode });
  });

  beforeEach(async () => {
    const database = await openDatabase(":memory:");
    sqlite = database.sqlite;
    migrateDatabase(sqlite);
    users = new UserService(database.db);
    secrets = new UserSecretService(database.db, jwtSecret);
    const owner = users.createUser("meeting-owner", "fake-test-password");
    const guest = users.createUser("guest", "fake-test-password");
    ownerToken = await signAuthToken(owner, jwtSecret);
    guestToken = await signAuthToken(guest, jwtSecret);
    app = createApp();
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
    vi.unstubAllGlobals();
  });

  it("limits endpoint settings and job data to the owner and keeps the token out of responses", async () => {
    await expect(client("").settings()).rejects.toThrow("401");
    await expect(client(guestToken).settings()).rejects.toThrow("gateway owner");
    await expect(client(guestToken).latest()).rejects.toThrow("gateway owner");
    await expect(client().saveSettings({ ...settings, parakeetUrl: "http://169.254.169.254:81/" })).rejects.toThrow("private IP");
    expect(() => meetingEndpoint("http://local.example:2000")).toThrow();
    expect(() => meetingEndpoint("http://user@127.0.0.1:2000")).toThrow();
    const saved = await client().saveSettings(settings);
    expect(saved).toMatchObject({ configured: true, hasObsidianToken: true });
    expect(saved).not.toHaveProperty("obsidianToken");
    const { obsidianToken, ...rest } = settings;
    expect(await client().saveSettings(rest)).toMatchObject({ hasObsidianToken: true });
  });

  it("resumes chunk upload after restart and retries a failed vault write without reprocessing", async () => {
    const external = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.redirect).toBe("error");
      if (url.endsWith("/transcribe")) return Response.json({ segments: [{ start: 81.8, text: "Ship on Friday." }] });
      if (url.endsWith("/chat/completions")) return Response.json({ choices: [{ message: { content: "## Decisions\n\nShip on Friday." } }] });
      return new Response(null, { status: external.mock.calls.filter(([called]) => called.includes("/vault/")).length > 1 ? 204 : 503 });
    });
    vi.stubGlobal("fetch", external);
    const api = client();
    await api.saveSettings(settings);
    const id = randomUUID();
    const create = { id, startedAt: "2026-11-27T08:15:30.000Z", totalBytes: 3, mimeType: "audio/webm;codecs=opus" };
    expect((await api.create(create)).stage).toBe("uploading");
    await expect(api.create({ ...create, id: randomUUID() })).rejects.toThrow("already pending");
    await expect(api.append(id, 1, "AQID")).rejects.toThrow("offset");
    await expect(api.submit(id)).rejects.toThrow("incomplete");
    await api.append(id, 0, "AQID");
    await app.close();
    app = createApp();
    expect((await api.create(create)).uploadedBytes).toBe(3);
    expect((await api.append(id, 0, "AQID")).uploadedBytes).toBe(3);
    await api.submit(id);
    await vi.waitFor(async () => expect((await api.latest())?.stage).toBe("failed"));
    await app.close();
    app = createApp();
    await api.retry(id);
    await vi.waitFor(async () => expect((await api.latest())?.stage).toBe("complete"));
    expect(external.mock.calls.filter(([url]) => url.endsWith("/transcribe"))).toHaveLength(1);
    expect(external.mock.calls.filter(([url]) => url.endsWith("/chat/completions"))).toHaveLength(1);
    const writes = external.mock.calls.filter(([url]) => url.includes("/vault/"));
    expect(writes).toHaveLength(2);
    expect(writes[0][0]).toBe(writes[1][0]);
    expect(writes[1][1].headers).toMatchObject({ authorization: `Bearer ${settings.obsidianToken}` });
    expect(writes[1][1].body).toContain("[00:01:21] Ship on Friday.");
    expect((await api.latest())?.noteUrl).toContain("obsidian://open?vault=Test%20vault");
    expect(sqlite.prepare("SELECT transcript, summary FROM meeting_recordings WHERE id = ?").get(id)).toEqual({ transcript: null, summary: null });
  });
});
