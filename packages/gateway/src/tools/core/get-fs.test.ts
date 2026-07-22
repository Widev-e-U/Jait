import { describe, expect, it, vi } from "vitest";
import { SurfaceRegistry } from "../../surfaces/registry.js";
import { FileSystemSurface } from "../../surfaces/filesystem.js";
import { RemoteFileSystemSurface } from "../../surfaces/remote-filesystem.js";
import type { WsControlPlane } from "../../ws.js";
import type { ToolContext } from "../contracts.js";
import { getFs, resolveProjectRoot } from "./get-fs.js";

const SESSION_ID = "session-win";

function createContext(projectRoot = "E:\\Zinsrechner"): ToolContext {
  return {
    sessionId: SESSION_ID,
    actionId: "action-1",
    projectRoot,
    requestedBy: "agent",
  };
}

function createMockWs(): WsControlPlane {
  return {
    proxyFsOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "stat") return { size: 0, isDirectory: true, modified: "" };
      if (op === "read") return { content: "remote-file-content" };
      if (op === "list") return ["src/"];
      return {};
    }),
  } as unknown as WsControlPlane;
}

/**
 * Start a RemoteFileSystemSurface for the session, mimicking what
 * /api/project/open does when a project is opened on a remote Windows node.
 */
async function withRemoteSurface(
  registry: SurfaceRegistry,
  projectRoot = "E:\\Zinsrechner",
  nodeId = "node-windows",
): Promise<RemoteFileSystemSurface> {
  const surface = new RemoteFileSystemSurface(`filesystem-remote`, createMockWs());
  await surface.start({ sessionId: SESSION_ID, projectRoot, nodeId });
  registry.registerInstance(surface.id, surface);
  return surface;
}

describe("getFs — remote node routing", () => {
  it("returns the remote surface when a session has a running RemoteFileSystemSurface", async () => {
    const registry = new SurfaceRegistry();
    await withRemoteSurface(registry);

    const fs = await getFs(registry, createContext(), "E:\\Zinsrechner\\README.md");
    expect(fs).toBeInstanceOf(RemoteFileSystemSurface);
    // Reading must be proxied to the remote node (no local ENOENT).
    await expect(fs.read("E:\\Zinsrechner\\README.md")).resolves.toBe("remote-file-content");
  });

  it("never resolves a Windows path against the gateway's local filesystem (no /home/.../E:\\... mangle)", async () => {
    const registry = new SurfaceRegistry();
    await withRemoteSurface(registry);

    const fs = await getFs(registry, createContext(), "E:\\Zinsrechner\\src\\index.ts");
    expect(fs).toBeInstanceOf(RemoteFileSystemSurface);
    // The returned surface's root is the remote Windows path, not a mangled POSIX path.
    const root = (fs.snapshot().metadata as Record<string, unknown>).projectRoot;
    expect(root).toBe("E:\\Zinsrechner");
    expect(String(root)).not.toMatch("/home/");
  });

  it("throws a clear error (instead of ENOENT) for a foreign-platform path with no remote surface", async () => {
    const registry = new SurfaceRegistry();
    // No remote surface registered — the path is Windows but gateway is non-Windows.
    await expect(
      getFs(registry, createContext(), "E:\\Zinsrechner\\README.md"),
    ).rejects.toThrow(/different platform.*no remote node surface/i);
  });

  it("still uses the local FileSystemSurface when there is no remote surface and the path is local", async () => {
    const registry = new SurfaceRegistry();
    const local = new FileSystemSurface(`fs-${SESSION_ID}`);
    await local.start({ sessionId: SESSION_ID, projectRoot: process.cwd() });
    registry.registerInstance(local.id, local);

    const fs = await getFs(registry, {
      ...createContext(process.cwd()),
      projectRoot: process.cwd(),
    });
    expect(fs).toBeInstanceOf(FileSystemSurface);
  });
});

describe("resolveProjectRoot — remote surfaces", () => {
  it("includes remote filesystem surfaces when resolving the project root", () => {
    const registry = new SurfaceRegistry();
    void withRemoteSurface(registry, "E:\\Zinsrechner");

    const root = resolveProjectRoot(registry, SESSION_ID, "E:\\Zinsrechner");
    expect(root).toBe("E:\\Zinsrechner");
  });

  it("falls back to the session path when no surface is running", () => {
    const registry = new SurfaceRegistry();
    const root = resolveProjectRoot(registry, SESSION_ID, "E:\\Zinsrechner");
    expect(root).toBe("E:\\Zinsrechner");
  });
});