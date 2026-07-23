import type { FsNode } from "@jait/shared";

export function resolveRemoteGitNodeId(
  nodes: FsNode[],
  cwd: string,
  requestedNodeId?: string | null,
  pathExistsLocally = false,
): string | null {
  const explicitNodeId = requestedNodeId?.trim();
  if (explicitNodeId) {
    if (explicitNodeId === "gateway") return null;
    const explicitNode = nodes.find((node) => node.id === explicitNodeId && !node.isGateway);
    return explicitNode?.id ?? explicitNodeId;
  }

  if (pathExistsLocally) return null;

  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(cwd);
  const expectedPlatform = isWindowsPath ? "windows" : null;
  for (const node of nodes) {
    if (node.isGateway) continue;
    if (expectedPlatform && node.platform !== expectedPlatform) continue;
    return node.id;
  }
  return null;
}
