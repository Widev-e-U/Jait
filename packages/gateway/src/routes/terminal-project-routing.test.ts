import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { registerTerminalRoutes } from "./terminals.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { RemoteFileSystemSurface } from "../surfaces/remote-filesystem.js";
import { ToolRegistry } from "../tools/registry.js";
import type { WsControlPlane } from "../ws.js";
import type { AuditWriter } from "../services/audit.js";

it("routes terminal creation through the session's remote filesystem when nodeId is omitted", async () => {
  const root = "C:\\Users\\jakob\\Tankstelle";
  const ws = {
    proxyFsOp: vi.fn(async () => ({ isDirectory: true })),
    proxyTerminalOp: vi.fn(async () => ({ pid: 42, shell: "pwsh.exe" })),
    sendTerminalOp: vi.fn(),
  } as unknown as WsControlPlane;
  const registry = new SurfaceRegistry();
  const remote = new RemoteFileSystemSurface("remote-project", ws);
  await remote.start({ sessionId: "tankstelle", projectRoot: root, nodeId: "windows-node" });
  registry.registerInstance(remote.id, remote);
  const app = Fastify();
  registerTerminalRoutes(app, registry, new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, ws);
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals", payload: { sessionId: "tankstelle", projectRoot: root } });
    expect(response.statusCode).toBe(201);
    expect(response.json().metadata).toMatchObject({ remote: true, nodeId: "windows-node", cwd: root });
    expect(ws.proxyTerminalOp).toHaveBeenCalledWith("windows-node", "start", expect.objectContaining({ projectRoot: root }), 15_000);
  } finally {
    await registry.stopAll("cleanup");
    await app.close();
  }
});
