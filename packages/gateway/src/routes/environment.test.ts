import { describe, it, expect } from "vitest";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { WorkspaceService } from "../services/workspaces.js";
import { RepositoryService } from "../services/repositories.js";
import { signAuthToken } from "../security/http-auth.js";

describe("Environment snapshot route", () => {
  it("GET /api/environment/snapshot returns aggregated state", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const workspaceService = new WorkspaceService(db);
    const repoService = new RepositoryService(db);
    const userId = "u1";
    const w = workspaceService.create({ userId, title: "Repo A", rootPath: "/home/user/repo-a", nodeId: "gateway" });
    const r = repoService.create({ userId, name: "Repo A", localPath: "/home/user/repo-a", defaultBranch: "main" });

    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
    const app = await createServer(config, { sqlite, workspaceService, repoService });

    const token = await signAuthToken({ id: userId, username: "tester" }, config.jwtSecret);
    const res = await app.inject({ method: "GET", url: "/api/environment/snapshot", headers: { Authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    const snapshot = body.snapshot;

    expect(snapshot.serverTime).toBeTypeOf("string");
    expect(Array.isArray(snapshot.nodes)).toBe(true);

    // Workspace/repo reflections
    expect(snapshot.workspaces?.some((x: any) => x.id === w.id)).toBe(true);
    expect(snapshot.repositories?.some((x: any) => x.id === r.id)).toBe(true);

    sqlite.close();
  });

  it("includes latest network scan result when available", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
    const app = await createServer(config, { sqlite });

    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO network_hosts (ip, mac, hostname, os_version, open_ports, ssh_reachable, agent_status, providers, first_seen_at, last_seen_at, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "192.168.1.10",
      null,
      "devbox",
      null,
      JSON.stringify([22]),
      1,
      "not-installed",
      JSON.stringify([]),
      now,
      now,
      now,
    );

    const token = await signAuthToken({ id: "u2", username: "tester" }, config.jwtSecret);
    const res = await app.inject({ method: "GET", url: "/api/environment/snapshot", headers: { Authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    const snapshot = body.snapshot;
    expect(snapshot.networkHosts?.length).toBe(1);
    expect(snapshot.networkHosts?.[0]?.ip).toBe("192.168.1.10");

    sqlite.close();
  });
});
