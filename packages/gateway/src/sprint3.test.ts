/**
 * Sprint 3 Tests — Terminal Surface, File System, Path Guards, Tools, Routes
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Path Guard Tests ────────────────────────────────────────────

import { PathGuard, PathTraversalError } from "./security/path-guard.js";

describe("PathGuard", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jait-pathguard-"));
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "index.ts"), "console.log('hello')");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("allows paths inside workspace", () => {
    const guard = new PathGuard({ workspaceRoot: workspace });
    const result = guard.validate("src/index.ts");
    expect(result).toContain("src");
    expect(result).toContain("index.ts");
  });

  it("blocks path traversal with ..", () => {
    const guard = new PathGuard({ workspaceRoot: workspace });
    expect(() => guard.validate("../../etc/passwd")).toThrow(PathTraversalError);
  });

  it("blocks null bytes", () => {
    const guard = new PathGuard({ workspaceRoot: workspace });
    expect(() => guard.validate("src/\0malicious")).toThrow(PathTraversalError);
  });

  it("blocks paths in global denied list", () => {
    const guard = process.platform === "win32"
      ? new PathGuard({ workspaceRoot: "C:\\Users\\test\\project" })
      : new PathGuard({ workspaceRoot: "/tmp/project" });
    const deniedTarget = process.platform === "win32"
      ? "C:\\Windows\\System32\\cmd.exe"
      : "/etc/passwd";
    expect(() => guard.validate(deniedTarget)).toThrow(PathTraversalError);
  });

  it("blocks custom denied paths", () => {
    const guard = new PathGuard({
      workspaceRoot: workspace,
      deniedPaths: [".env"],
    });
    expect(() => guard.validate(".env")).toThrow(PathTraversalError);
  });

  it("isAllowed returns boolean without throwing", () => {
    const guard = new PathGuard({ workspaceRoot: workspace });
    expect(guard.isAllowed("src/index.ts")).toBe(true);
    expect(guard.isAllowed("../../etc/passwd")).toBe(false);
  });

  it("validates symlinks that escape workspace", async () => {
    const guard = new PathGuard({ workspaceRoot: workspace, checkSymlinks: true });
    const outsideDir = mkdtempSync(join(tmpdir(), "jait-outside-"));
    writeFileSync(join(outsideDir, "secret.txt"), "secret");

    try {
      symlinkSync(join(outsideDir, "secret.txt"), join(workspace, "src", "link.txt"));
      await expect(
        guard.validateWithSymlinkCheck("src/link.txt")
      ).rejects.toThrow(PathTraversalError);
    } catch (err) {
      // Symlink creation may fail on Windows without admin rights — skip gracefully
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        // Can't test symlinks without permissions
        return;
      }
      throw err;
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("allows files that don't exist yet (for writes)", async () => {
    const guard = new PathGuard({ workspaceRoot: workspace });
    const result = await guard.validateWithSymlinkCheck("src/newfile.ts");
    expect(result).toContain("newfile.ts");
  });
});

// ── File System Surface Tests ───────────────────────────────────

import { FileSystemSurface } from "./surfaces/filesystem.js";

describe("FileSystemSurface", () => {
  let workspace: string;
  let fs: FileSystemSurface;

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), "jait-fs-"));
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", workspaceRoot: workspace });
  });

  afterEach(async () => {
    await fs.stop();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("starts in running state", () => {
    expect(fs.state).toBe("running");
    expect(fs.sessionId).toBe("test-session");
  });

  it("reads files within workspace", async () => {
    const content = await fs.read("src/hello.ts");
    expect(content).toBe("export const x = 42;\n");
  });

  it("writes files and creates parent dirs", async () => {
    await fs.write("src/deep/nested/file.ts", "const y = 1;\n");
    const content = readFileSync(join(workspace, "src", "deep", "nested", "file.ts"), "utf-8");
    expect(content).toBe("const y = 1;\n");
  });

  it("patches files (search & replace)", async () => {
    const result = await fs.patch("src/hello.ts", "42", "99");
    expect(result.matched).toBe(true);
    const content = readFileSync(join(workspace, "src", "hello.ts"), "utf-8");
    expect(content).toContain("99");
    expect(content).not.toContain("42");
  });

  it("returns matched=false when search string not found", async () => {
    const result = await fs.patch("src/hello.ts", "nonexistent", "replaced");
    expect(result.matched).toBe(false);
  });

  it("lists directory entries", async () => {
    writeFileSync(join(workspace, "src", "other.ts"), "");
    const entries = await fs.list("src");
    expect(entries).toContain("hello.ts");
    expect(entries).toContain("other.ts");
  });

  it("checks file existence", async () => {
    expect(await fs.exists("src/hello.ts")).toBe(true);
    expect(await fs.exists("src/nope.ts")).toBe(false);
  });

  it("gets file stats", async () => {
    const info = await fs.statFile("src/hello.ts");
    expect(info.size).toBeGreaterThan(0);
    expect(info.isDirectory).toBe(false);
  });

  it("blocks reads outside workspace", async () => {
    await expect(fs.read("../../etc/passwd")).rejects.toThrow();
  });

  it("blocks writes outside workspace", async () => {
    await expect(fs.write("../../tmp/evil.txt", "pwned")).rejects.toThrow();
  });

  it("tracks operation count in snapshot", async () => {
    await fs.read("src/hello.ts");
    await fs.read("src/hello.ts");
    const snap = fs.snapshot();
    expect(snap.metadata.operationCount).toBe(2);
  });
});

// ── Surface Registry Tests (async) ──────────────────────────────

import { SurfaceRegistry } from "./surfaces/registry.js";
import { FileSystemSurfaceFactory } from "./surfaces/filesystem.js";

describe("SurfaceRegistry (async lifecycle)", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jait-registry-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("starts a file-system surface", async () => {
    const registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());

    const s = await registry.startSurface("filesystem", "fs-1", {
      sessionId: "s1",
      workspaceRoot: workspace,
    });

    expect(s.state).toBe("running");
    expect(s.sessionId).toBe("s1");
    expect(registry.listSnapshots()).toHaveLength(1);
  });

  it("stops and removes a surface", async () => {
    const registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());

    await registry.startSurface("filesystem", "fs-1", {
      sessionId: "s1",
      workspaceRoot: workspace,
    });

    const stopped = await registry.stopSurface("fs-1");
    expect(stopped).toBe(true);
    expect(registry.listSurfaces()).toHaveLength(0);
  });

  it("filters surfaces by session", async () => {
    const registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());

    await registry.startSurface("filesystem", "fs-a", { sessionId: "a", workspaceRoot: workspace });
    await registry.startSurface("filesystem", "fs-b", { sessionId: "b", workspaceRoot: workspace });
    await registry.startSurface("filesystem", "fs-a2", { sessionId: "a", workspaceRoot: workspace });

    expect(registry.getBySession("a")).toHaveLength(2);
    expect(registry.getBySession("b")).toHaveLength(1);
  });
});

// ── Tool Registry Tests ─────────────────────────────────────────

import { ToolRegistry } from "./tools/registry.js";

describe("ToolRegistry", () => {
  it("registers and lists tools", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "test.tool",
      description: "A test tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "done" }),
    });

    expect(registry.has("test.tool")).toBe(true);
    expect(registry.listNames()).toContain("test.tool");
  });

  it("executes a registered tool", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "Echoes input",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      execute: async (input: { text: string }) => ({
        ok: true,
        message: input.text,
        data: { echo: input.text },
      }),
    });

    const result = await registry.execute("echo", { text: "hello" }, {
      sessionId: "s1",
      actionId: "a1",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe("hello");
  });

  it("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("nope", {}, {
      sessionId: "s1",
      actionId: "a1",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown tool");
  });
});

// ── createToolRegistry Tests ────────────────────────────────────

import { createToolRegistry } from "./tools/index.js";

describe("createToolRegistry", () => {
  it("registers all Sprint 3 tools", () => {
    const surfaceRegistry = new SurfaceRegistry();
    const tools = createToolRegistry(surfaceRegistry);

    const names = tools.listNames();
    expect(names).toContain("terminal.run");
    expect(names).toContain("terminal.stream");
    expect(names).toContain("file.read");
    expect(names).toContain("file.write");
    expect(names).toContain("file.patch");
    expect(names).toContain("file.list");
    expect(names).toContain("file.stat");
    expect(names).toContain("os.query");
    expect(names).toContain("os.install");
    expect(names).toContain("surfaces.list");
    expect(names).toContain("surfaces.start");
    expect(names).toContain("surfaces.stop");
    expect(names.length).toBeGreaterThanOrEqual(12);
  });
});

// ── os.query Tool Tests ─────────────────────────────────────────

import { createOsQueryTool } from "./tools/os-tools.js";

describe("os.query tool", () => {
  it("returns system info", async () => {
    const tool = createOsQueryTool();
    const result = await tool.execute({ query: "info" }, {
      sessionId: "s1",
      actionId: "a1",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });

    expect(result.ok).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.platform).toBeDefined();
    expect(data.hostname).toBeDefined();
    expect(data.cpus).toBeGreaterThan(0);
    expect(data.totalMemoryGB).toBeGreaterThan(0);
  });

  it("returns safe env vars", async () => {
    const tool = createOsQueryTool();
    const result = await tool.execute({ query: "env" }, {
      sessionId: "s1",
      actionId: "a1",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    });

    expect(result.ok).toBe(true);
    const data = result.data as Record<string, string>;
    // Should NOT expose JWT_SECRET or similar
    expect(data["JWT_SECRET"]).toBeUndefined();
  });
});

// ── Terminal + Tool Route Tests ─────────────────────────────────

import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { TerminalSurfaceFactory } from "./surfaces/terminal.js";

describe("Terminal & Tool routes", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let surfaceRegistry: SurfaceRegistry;
  let toolRegistry: ReturnType<typeof createToolRegistry>;

  beforeEach(async () => {
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  });

  it("GET /api/terminals returns empty list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/terminals" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { terminals: unknown[] };
    expect(body.terminals).toEqual([]);
  });

  it("GET /api/tools lists all registered tools", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tools" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tools: { name: string; description: string }[] };
    expect(body.tools.length).toBeGreaterThanOrEqual(12);
    expect(body.tools.map((t) => t.name)).toContain("file.read");
    expect(body.tools.map((t) => t.name)).toContain("terminal.run");
    expect(body.tools.map((t) => t.name)).toContain("surfaces.list");
  });

  it("GET /api/surfaces returns empty + registered types", async () => {
    const res = await app.inject({ method: "GET", url: "/api/surfaces" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { surfaces: unknown[]; registeredTypes: string[] };
    expect(body.surfaces).toEqual([]);
    expect(body.registeredTypes).toContain("terminal");
    expect(body.registeredTypes).toContain("filesystem");
  });

  it("POST /api/tools/execute surfaces.list returns data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tools/execute",
      payload: { tool: "surfaces.list", input: {}, sessionId: "s1" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: { surfaces: unknown[]; registeredTypes: string[] } };
    expect(body.ok).toBe(true);
    expect(body.data.registeredTypes).toContain("terminal");
  });

  it("POST /api/tools/execute returns error for unknown tool", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tools/execute",
      payload: { tool: "nope", input: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toContain("Unknown tool");
  });

  it("POST /api/tools/execute os.query info returns system data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tools/execute",
      payload: { tool: "os.query", input: { query: "info" }, sessionId: "s1" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.data.platform).toBeDefined();
  });
});
