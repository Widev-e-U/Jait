import { afterEach, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { ProjectService } from "../services/projects.js";
import { signAuthToken } from "../security/http-auth.js";
import { __chatTestUtils } from "./chat.js";

const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "shared-stream-test-secret" };
let app: Awaited<ReturnType<typeof createServer>> | null = null;
afterEach(async () => { await app?.close(); app = null; });

it("only forwards visible text and closes an idle member stream after revocation", async () => {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const users = new UserService(db);
  const sessions = new SessionService(db);
  const projects = new ProjectService(db);
  const owner = users.createUser("shared-stream-owner", "password123");
  const member = users.createUser("shared-stream-member", "password123");
  const project = projects.create({ userId: owner.id, title: "Shared" });
  const session = sessions.create({ userId: owner.id, projectId: project.id });
  projects.addMember(project.id, member.username);
  projects.setSessionSharing(session.id, owner.id, true);
  sqlite.prepare("INSERT INTO messages (id, session_id, role, content, author_user_id, created_at) VALUES (?, ?, 'user', ?, ?, ?)")
    .run("shared-message", session.id, "Visible message", owner.id, new Date().toISOString());
  app = await createServer(config, { db, sqlite, sessionService: sessions, userService: users, projectService: projects });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  const token = await signAuthToken({ id: member.id, username: member.username }, config.jwtSecret);
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/sessions/${session.id}/shared-stream`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    const snapshot = decoder.decode(first.value);
    expect(snapshot).toContain('"type":"snapshot"');
    expect(snapshot).toContain(`"authorUserId":"${owner.id}"`);
    const emit = __chatTestUtils.emitToSubscribers;
    emit(session.id, { type: "tool_start", tool: "secret", args: { secret: "do not share" }, call_id: "x" });
    emit(session.id, { type: "thinking", content: "private reasoning" });
    emit(session.id, { type: "token", content: "visible" });
    const next = await reader.read();
    const visible = decoder.decode(next.value);
    expect(visible).toContain('"content":"visible"');
    expect(visible).not.toContain("do not share");
    expect(visible).not.toContain("private reasoning");
    emit(session.id, { type: "request", content: "Next message", provider: "codex", mode: "agent", authorUserId: owner.id });
    const request = decoder.decode((await reader.read()).value);
    expect(request).toContain(`"authorUserId":"${owner.id}"`);
    expect(request).not.toContain('"provider"');
    projects.removeMember(project.id, member.id);
    const end = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("stream stayed open")), 4000))]);
    expect(end.done).toBe(true);
  } finally { controller.abort(); }
});
