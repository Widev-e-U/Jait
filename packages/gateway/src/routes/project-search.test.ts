import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { createServer } from "../server.js";
import { FileSystemSurfaceFactory, SurfaceRegistry } from "../surfaces/index.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test" as const,
};

describe("GET /api/project/search ownership", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let surfaceRegistry: SurfaceRegistry;
  let ownedRoot: string;
  let foreignRoot: string;
  let ownerHeaders: { authorization: string };

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const userService = new UserService(opened.db);
    const sessionService = new SessionService(opened.db);
    const owner = userService.createUser("project-search-owner", "password123");
    const foreignUser = userService.createUser("project-search-foreign", "password123");
    const ownerSession = sessionService.create({ userId: owner.id, name: "Owned project" });
    const foreignSession = sessionService.create({ userId: foreignUser.id, name: "Foreign project" });

    ownedRoot = await mkdtemp(join(tmpdir(), "jait-owned-search-"));
    foreignRoot = await mkdtemp(join(tmpdir(), "jait-foreign-search-"));
    execFileSync("git", ["init", "--quiet"], { cwd: ownedRoot });
    execFileSync("git", ["init", "--quiet"], { cwd: foreignRoot });
    await mkdir(join(ownedRoot, "src"), { recursive: true });
    await mkdir(join(foreignRoot, "src"), { recursive: true });
    await writeFile(
      join(ownedRoot, "src/owned-result.ts"),
      "export const ownedNeedle = true;\n",
      "utf8",
    );
    await writeFile(
      join(foreignRoot, "src/foreign-result.ts"),
      "export const foreignNeedle = true;\n",
      "utf8",
    );

    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    await surfaceRegistry.startSurface("filesystem", "foreign-surface", {
      sessionId: foreignSession.id,
      projectRoot: foreignRoot,
    });
    await surfaceRegistry.startSurface("filesystem", "owned-surface", {
      sessionId: ownerSession.id,
      projectRoot: ownedRoot,
    });

    const token = await signAuthToken(
      { id: owner.id, username: owner.username },
      testConfig.jwtSecret,
    );
    ownerHeaders = { authorization: `Bearer ${token}` };
    app = await createServer(testConfig, {
      db: opened.db,
      sqlite,
      userService,
      sessionService,
      surfaceRegistry,
    });
  });

  afterEach(async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app.close();
    sqlite.close();
    await Promise.all([
      rm(ownedRoot, { recursive: true, force: true }),
      rm(foreignRoot, { recursive: true, force: true }),
    ]);
  });

  it("requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/project/search?query=ownedNeedle&mode=content&surfaceId=owned-surface",
    });

    expect(response.statusCode).toBe(401);
  });

  it("searches an explicitly owned surface", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/project/search?query=ownedNeedle&mode=content&surfaceId=owned-surface",
      headers: ownerHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "content",
      matches: [{ file: "src/owned-result.ts", line: 1 }],
    });
  });

  it("hides an explicitly foreign surface", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/project/search?query=foreignNeedle&mode=content&surfaceId=foreign-surface",
      headers: ownerHeaders,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "NO_PROJECT" });
  });

  it("skips a foreign first surface when surfaceId is omitted", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/project/search?query=ownedNeedle&mode=content",
      headers: ownerHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "content",
      matches: [{ file: "src/owned-result.ts", line: 1 }],
    });
  });
});
