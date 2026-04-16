import type { AssistantProfile } from "./assistant.js";
import type { NetworkHost } from "./network.js";
import type { NodeState } from "./node.js";
export interface EnvironmentWorkspace {
    id: string;
    title: string | null;
    rootPath: string | null;
    nodeId: string | null;
    status: string;
    sessionCount: number;
    lastActiveAt: string;
}
export interface EnvironmentRepository {
    id: string;
    name: string;
    localPath: string;
    defaultBranch: string;
    githubUrl: string | null;
    deviceId: string | null;
    nodeName: string | null;
    connected: boolean;
    updatedAt: string;
}
export interface EnvironmentConnector {
    id: string;
    kind: "provider" | "node";
    name: string;
    status: "ready" | "offline" | "unknown";
    details: string | null;
}
export interface EnvironmentSnapshot {
    serverTime: string;
    assistants: AssistantProfile[];
    nodes: NodeState[];
    workspaces: EnvironmentWorkspace[];
    repositories: EnvironmentRepository[];
    networkHosts: NetworkHost[];
    connectors: EnvironmentConnector[];
}
//# sourceMappingURL=environment.d.ts.map