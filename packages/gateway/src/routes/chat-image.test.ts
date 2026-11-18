import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import type { SessionService } from "../services/sessions.js";

const artifacts = resolve(import.meta.dirname, "../../../../.jait/artifacts");

describe("chat project screenshot paths", () => {
  let root: string;
  let project: string;
  let app: Awaited<ReturnType<typeof createServer>>;
  let headers: { authorization: string };
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=", "base64");
  const imagePath = ".jait/shots/provider-selector-390.png";
  const request = (path = imagePath, sessionId = "image-chat") => ({
    method: "GET" as const,
    url: "/api/browser/screenshot?" + new URLSearchParams({ path, sessionId }),
    headers,
  });

  beforeAll(async () => {
    await mkdir(artifacts, { recursive: true });
    root = await mkdtemp(join(artifacts, "chat-image-"));
    project = join(root, "project");
    await mkdir(join(project, ".jait/shots"), { recursive: true });
    await mkdir(join(root, "gateway"), { recursive: true });
    await writeFile(join(project, imagePath), bytes);
    await writeFile(join(root, "outside.png"), bytes);
    await symlink(root, join(project, "escape"), "dir");
    const config = { ...loadConfig(), logLevel: "silent" };
    const sessionService = {
      getById: (id: string, userId?: string) => id === "image-chat" && userId === "owner"
        ? { id, userId, projectPath: project } : null,
    } as unknown as SessionService;
    app = await createServer(config, { sessionService });
    headers = { authorization: "Bearer " + await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret) };
  });

  afterAll(async () => {
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("loads a relative screenshot from the chat project", async () => {
    const response = await app.inject(request());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.rawPayload).toEqual(bytes);
    expect(response.headers["content-type"]).toContain("image/png");
  });

  it("loads absolute project paths when gateway cwd is elsewhere", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(join(root, "gateway"));
    try {
      const response = await app.inject(request(join(project, imagePath)));
      expect(response.statusCode, response.body).toBe(200);
      expect(response.rawPayload).toEqual(bytes);
    } finally { cwd.mockRestore(); }
  });

  it("does not expose another user's chat or an unknown chat", async () => {
    const config = loadConfig();
    const other = { authorization: "Bearer " + await signAuthToken({ id: "other", username: "other" }, config.jwtSecret) };
    expect((await app.inject({ ...request(join(project, imagePath)), headers: other })).statusCode).toBe(404);
    expect((await app.inject(request(join(project, imagePath), "missing"))).statusCode).toBe(404);
  });

  it.each(["../outside.png", "escape/outside.png"])("blocks project escape %s", async path => {
    expect((await app.inject(request(path))).statusCode).toBe(403);
  });

  it("blocks an absolute image outside the chat project", async () => {
    expect((await app.inject(request(join(root, "outside.png")))).statusCode).toBe(403);
  });

  it("requires authentication", async () => {
    expect((await app.inject({ ...request(), headers: {} })).statusCode).toBe(401);
  });

  it("returns clear errors for missing images and unsupported formats", async () => {
    expect((await app.inject(request(".jait/shots/missing.png"))).statusCode).toBe(404);
    expect((await app.inject(request("notes.txt"))).statusCode).toBe(400);
  });
});
