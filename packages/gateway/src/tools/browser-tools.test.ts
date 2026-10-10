import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { ToolDefinition, ToolContext } from "./contracts.js";
import {
  createBrowserNavigateTool, createBrowserSnapshotTool, createBrowserInspectTool,
  createBrowserInteractionTools, createBrowserSandboxStartTool,
} from "./browser-tools.js";
import type { SandboxManager } from "../security/sandbox-manager.js";

const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];

let directory: string;
let capturePath: string;
const artifacts: string[] = [];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
});

function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}

describe.each(cases)("$name", ({ name, input, method, args }) => {
  it("uses the visible preview and returns the action result", async () => {
    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    expect(result.ok).toBe(true);
    expect(f.surface[method as keyof typeof f.surface]).toHaveBeenCalledWith(...args, signal);
    expect(f.registry.startSurface).not.toHaveBeenCalled();
    expect(f.collaboration.assertAgentControl).toHaveBeenCalledWith(f.surface.id);
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      expect(data.result.capturePath).toBe(capturePath);
      expect(await readFile(data.result.path)).toEqual(await readFile(capturePath));
    } else {
      expect(result.data).toMatchObject({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text });
    }
  });

  it("does no work after cancellation", async () => {
    const f = fixture();
    expect(await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() }))
      .toEqual({ ok: false, message: "Cancelled" });
    expect(f.registry.getSurface).not.toHaveBeenCalled();
    expect(f.registry.startSurface).not.toHaveBeenCalled();
    expect(f.surface[method as keyof typeof f.surface]).not.toHaveBeenCalled();
  });

  it("blocks agent actions while the user controls the browser", async () => {
    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await expect(f.tool(name).execute(input, context)).rejects.toThrow("controlled by user");
    expect(f.registry.getSurface).not.toHaveBeenCalled();
    expect(f.surface[method as keyof typeof f.surface]).not.toHaveBeenCalled();
  });

  it("does not create a hidden browser when the linked preview has stopped", async () => {
    const f = fixture();
    f.surface.state = "stopped";
    await expect(f.tool(name).execute(input, context)).rejects.toThrow("not running");
    expect(f.registry.startSurface).not.toHaveBeenCalled();
  });

  it("reports browser action failures instead of returning success", async () => {
    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await expect(f.tool(name).execute(input, context)).rejects.toThrow("Browser disconnected");
  });

  it("suppresses page contents in secret-safe sessions", async () => {
    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    expect(result.data).toMatchObject({ captureSuppressed: true });
    if (name === "browser.screenshot") {
      expect(result.ok).toBe(false);
      expect(f.surface.screenshot).not.toHaveBeenCalled();
    } else {
      expect(result.data).toMatchObject({ textPreview: "", interactiveElements: [], target: null });
      expect(JSON.stringify(result.data)).not.toContain(snapshot.text);
    }
  });
});

describe("browser surface startup and screenshot transport", () => {
  it("starts the chat browser with the active project and session", async () => {
    const f = fixture();
    f.registry.getSurface.mockReturnValue(undefined);
    const tool = createBrowserNavigateTool(f.registry as unknown as SurfaceRegistry);
    await tool.execute({ url: snapshot.url }, context);
    expect(f.registry.startSurface).toHaveBeenCalledWith("browser", `browser-${context.sessionId}`, {
      sessionId: context.sessionId, projectRoot: context.projectRoot, userId: undefined,
    });
  });

  it("copies a screenshot from the execution node when the capture is remote", async () => {
    const f = fixture();
    f.surface.screenshot.mockResolvedValue("/remote/capture.png");
    f.ws.proxyFsOp.mockResolvedValue({ content: Buffer.from("remote-image").toString("base64") });
    const result = await f.tool("browser.screenshot").execute({}, { ...context, executionNodeId: "test-node" });
    const data = result.data as { result: { path: string } };
    artifacts.push(data.result.path);
    expect(f.ws.proxyFsOp).toHaveBeenCalledWith("test-node", "readBinary", { path: "/remote/capture.png" });
    expect(await readFile(data.result.path, "utf8")).toBe("remote-image");
  });

  it("does not conceal a successful click if the follow-up inspection fails", async () => {
    const f = fixture();
    f.surface.inspect.mockRejectedValue(new Error("Page navigating"));
    expect(await f.tool("browser.click").execute({ selector: "#save" }, context)).toMatchObject({
      ok: true, data: { browserId: f.surface.id, actionResult: { selector: "#save" } },
    });
  });
});

describe("browser.sandbox.start", () => {
  it("forwards ports and project mounting to the sandbox manager", async () => {
    const manager = { startBrowserSandbox: vi.fn().mockResolvedValue({ containerId: "sandbox-browser" }) };
    const tool = createBrowserSandboxStartTool(manager as unknown as SandboxManager);
    const result = await tool.execute({ novncPort: 16080, vncPort: 15900, mountMode: "read-only" }, context);
    expect(result.ok).toBe(true);
    expect(manager.startBrowserSandbox).toHaveBeenCalledWith({ projectRoot: context.projectRoot, novncPort: 16080, vncPort: 15900, mountMode: "read-only" });
  });
});
