import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliProviderAdapter, ProviderInfo, ProviderSession, StartSessionOptions } from "../providers/contracts.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { createServer } from "../server.js";
import { AssistantProfileService } from "../services/assistant-profiles.js";
import { AuditWriter } from "../services/audit.js";
import { RepositoryService } from "../services/repositories.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { WorkspaceService } from "../services/workspaces.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return {
      id: "provider-session",
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(): Promise<void> {}
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(): () => void {
    return () => {};
  }
}

async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("assistant profile and environment routes", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let userService: UserService;
  let workspaceService: WorkspaceService;
  let assistantProfileService: AssistantProfileService;
  let repoService: RepositoryService;
  let sessionService: SessionService;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    userService = new UserService(opened.db);
    workspaceService = new WorkspaceService(opened.db);
    assistantProfileService = new AssistantProfileService(opened.db);
    repoService = new RepositoryService(opened.db);
    sessionService = new SessionService(opened.db);
    const audit = new AuditWriter(opened.db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockProvider());

    const ws = {
      registerGatewayFsNode: () => {},
      getNodeRegistry: () => ({
        version: 1,
        serverTime: new Date().toISOString(),
        nodes: [
          {
            id: "gateway",
            name: "Gateway",
            platform: "linux",
            role: "gateway",
            lifecycle: "ready",
            protocolVersion: 1,
            capabilities: {
              providers: ["codex"],
              surfaces: ["terminal", "filesystem"],
              tools: ["thread.control"],
              screenShare: false,
              voice: false,
              preview: true,
            },
            connectedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          },
        ],
      }),
      getFsNodes: () => [
        {
          id: "gateway",
          name: "Gateway",
          platform: "linux",
          clientId: "gateway",
          isGateway: true,
          providers: ["codex"],
          registeredAt: new Date().toISOString(),
        },
      ],
    } as any;

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      userService,
      sessionService,
      workspaceService,
      assistantProfileService,
      repoService,
      providerRegistry,
      ws,
      audit,
    });
  });

  afterEach(async () => {
    await app?.close();
    sqlite.close();
  });

  it("creates, updates, and manages default assistant profiles", async () => {
    const user = userService.createUser("assistant-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/assistants/profiles",
      headers,
      payload: {
        name: "Operator",
        description: "Primary assistant",
        runtimeMode: "supervised",
        enabledSkills: ["coding-agent"],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body) as { profile: { id: string; isDefault: boolean; enabledSkills: string[] } };
    expect(created.profile.isDefault).toBe(true);
    expect(created.profile.enabledSkills).toEqual(["coding-agent"]);

    const secondRes = await app.inject({
      method: "POST",
      url: "/api/assistants/profiles",
      headers,
      payload: {
        name: "Network assistant",
        isDefault: true,
      },
    });
    expect(secondRes.statusCode).toBe(201);
    const second = JSON.parse(secondRes.body) as { profile: { id: string; isDefault: boolean } };
    expect(second.profile.isDefault).toBe(true);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/assistants/profiles",
      headers,
    });
    expect(listRes.statusCode).toBe(200);
    const listed = JSON.parse(listRes.body) as { profiles: Array<{ id: string; isDefault: boolean }> };
    expect(listed.profiles).toHaveLength(2);
    expect(listed.profiles.find((profile) => profile.id === created.profile.id)?.isDefault).toBe(false);

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/assistants/profiles/${created.profile.id}`,
      headers,
      payload: {
        toolProfile: "strict",
        enabledPlugins: ["calendar"],
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.body) as { profile: { toolProfile: string | null; enabledPlugins: string[] } };
    expect(updated.profile.toolProfile).toBe("strict");
    expect(updated.profile.enabledPlugins).toEqual(["calendar"]);
  });

  it("returns an environment snapshot across assistants, workspaces, repositories, providers, and network hosts", async () => {
    const user = userService.createUser("env-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    assistantProfileService.create(user.id, {
      name: "Daily operator",
      enabledSkills: ["tmux"],
    });

    const workspace = workspaceService.create({
      userId: user.id,
      title: "Jait",
      rootPath: "/home/jakob/jait",
      nodeId: "gateway",
    });

    sessionService.create({
      userId: user.id,
      workspaceId: workspace.id,
      workspacePath: workspace.rootPath ?? undefined,
      name: "Main session",
    });

    repoService.create({
      userId: user.id,
      name: "Jait",
      localPath: "/home/jakob/jait",
      defaultBranch: "main",
    });

    sqlite.prepare(`
      INSERT INTO network_hosts (ip, mac, hostname, os_version, open_ports, ssh_reachable, agent_status, providers, first_seen_at, last_seen_at, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "192.168.1.20",
      null,
      "nas",
      "Linux",
      JSON.stringify([22, 443]),
      1,
      "running",
      JSON.stringify(["codex"]),
      "2026-03-26T00:00:00.000Z",
      "2026-03-26T00:00:00.000Z",
      "2026-03-26T00:00:00.000Z",
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/environment/snapshot",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      snapshot: {
        assistants: Array<{ name: string }>;
        nodes: Array<{ id: string }>;
        workspaces: Array<{ id: string; sessionCount: number }>;
        repositories: Array<{ name: string; connected: boolean }>;
        networkHosts: Array<{ hostname: string | null }>;
        connectors: Array<{ id: string; status: string }>;
      };
    };
    expect(body.snapshot.assistants.map((profile) => profile.name)).toContain("Daily operator");
    expect(body.snapshot.nodes.map((node) => node.id)).toContain("gateway");
    expect(body.snapshot.workspaces.find((entry) => entry.id === workspace.id)?.sessionCount).toBe(1);
    expect(body.snapshot.repositories.find((entry) => entry.name === "Jait")?.connected).toBe(true);
    expect(body.snapshot.networkHosts.find((host) => host.hostname === "nas")).toBeTruthy();
    expect(body.snapshot.connectors.find((connector) => connector.id === "codex")?.status).toBe("ready");
  });
});
