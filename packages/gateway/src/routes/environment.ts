import type { NetworkHost } from "@jait/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { requireAuth } from "../security/http-auth.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { AssistantProfileService } from "../services/assistant-profiles.js";
import type { RepositoryService } from "../services/repositories.js";
import type { WorkspaceService } from "../services/workspaces.js";
import type { WsControlPlane } from "../ws.js";
import type { AssistantProfileRecord } from "../services/assistant-profiles.js";

interface EnvironmentWorkspace {
  id: string;
  title: string | null;
  rootPath: string | null;
  nodeId: string | null;
  status: string | null;
  sessionCount: number;
  lastActiveAt: string;
}

interface EnvironmentRepository {
  id: string;
  name: string;
  localPath: string;
  defaultBranch: string | null;
  githubUrl: string | null;
  deviceId: string | null;
  nodeName: string | null;
  connected: boolean;
  updatedAt: string;
}

interface EnvironmentConnector {
  id: string;
  kind: "provider" | "node";
  name: string;
  status: "ready" | "offline";
  details?: string | null;
}

interface EnvironmentSnapshot {
  serverTime: string;
  assistants: AssistantProfileRecord[];
  nodes: ReturnType<WsControlPlane["getNodeRegistry"]>["nodes"];
  workspaces: EnvironmentWorkspace[];
  repositories: EnvironmentRepository[];
  networkHosts: NetworkHost[];
  connectors: EnvironmentConnector[];
}

interface EnvironmentRouteDeps {
  assistantProfileService?: AssistantProfileService;
  workspaceService?: WorkspaceService;
  repoService?: RepositoryService;
  providerRegistry?: ProviderRegistry;
  ws?: WsControlPlane;
  sqlite?: SqliteDatabase;
}

interface DbHostRow {
  ip: string;
  mac: string | null;
  hostname: string | null;
  os_version: string | null;
  open_ports: string;
  ssh_reachable: number;
  agent_status: string;
  providers: string | null;
  last_seen_at: string;
}

function loadNetworkHosts(sqlite?: SqliteDatabase): NetworkHost[] {
  if (!sqlite) return [];
  const rows = sqlite.prepare("SELECT * FROM network_hosts ORDER BY last_seen_at DESC").all() as DbHostRow[];
  return rows.map((row) => ({
    ip: row.ip,
    mac: row.mac,
    hostname: row.hostname,
    vendor: null,
    alive: true,
    openPorts: JSON.parse(row.open_ports) as number[],
    sshReachable: row.ssh_reachable === 1,
    agentStatus: row.agent_status as NetworkHost["agentStatus"],
    osVersion: row.os_version,
    providers: row.providers ? (JSON.parse(row.providers) as string[]) : undefined,
    lastSeen: row.last_seen_at,
  }));
}

export function registerEnvironmentRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: EnvironmentRouteDeps,
): void {
  app.get("/api/environment/snapshot", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const assistants = deps.assistantProfileService?.list(user.id) ?? [];
    const nodes = deps.ws?.getNodeRegistry().nodes ?? [];
    const workspaces = deps.workspaceService?.list("active", user.id) ?? [];
    const sessionCounts = deps.workspaceService?.getActiveSessionCounts(user.id) ?? new Map<string, number>();
    const environmentWorkspaces: EnvironmentWorkspace[] = workspaces.map((workspace) => ({
      id: workspace.id,
      title: workspace.title,
      rootPath: workspace.rootPath,
      nodeId: workspace.nodeId,
      status: workspace.status,
      sessionCount: sessionCounts.get(workspace.id) ?? 0,
      lastActiveAt: workspace.lastActiveAt,
    }));

    const connectedNodes = new Map((deps.ws?.getFsNodes() ?? []).map((node) => [node.id, node.name]));
    const repositories = (deps.repoService?.list(user.id) ?? []).map<EnvironmentRepository>((repo) => ({
      id: repo.id,
      name: repo.name,
      localPath: repo.localPath,
      defaultBranch: repo.defaultBranch,
      githubUrl: repo.githubUrl,
      deviceId: repo.deviceId,
      nodeName: repo.deviceId ? connectedNodes.get(repo.deviceId) ?? null : "Gateway",
      connected: repo.deviceId ? connectedNodes.has(repo.deviceId) : true,
      updatedAt: repo.updatedAt,
    }));

    const providerConnectors = deps.providerRegistry
      ? await deps.providerRegistry.checkAll().then((providers) => providers.map<EnvironmentConnector>((provider) => ({
          id: provider.id,
          kind: "provider",
          name: provider.name,
          status: provider.available ? "ready" : "offline",
          details: provider.unavailableReason ?? null,
        })))
      : [];
    const nodeConnectors = nodes.map<EnvironmentConnector>((node) => ({
      id: node.id,
      kind: "node",
      name: node.name,
      status: node.lifecycle === "ready" ? "ready" : "offline",
      details: `${node.platform} · ${node.role}`,
    }));

    const snapshot: EnvironmentSnapshot = {
      serverTime: new Date().toISOString(),
      assistants,
      nodes,
      workspaces: environmentWorkspaces,
      repositories,
      networkHosts: loadNetworkHosts(deps.sqlite),
      connectors: [...providerConnectors, ...nodeConnectors],
    };

    return { snapshot };
  });
}
