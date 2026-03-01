import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { BrowserSurfaceFactory, type BrowserDriver, type BrowserPageSnapshot } from "./surfaces/browser.js";
import {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
} from "./tools/browser-tools.js";
import { SSRFGuard } from "./security/ssrf-guard.js";

const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  workspaceRoot: "/workspace/Jait",
  requestedBy: "test",
};

class MockBrowserDriver implements BrowserDriver {
  calls: string[] = [];
  currentUrl = "about:blank";

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    return path ?? "artifacts/default.png";
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        { role: "button", name: "Submit", selector: "#submit" },
        { role: "textbox", name: "Email", selector: "#email" },
      ],
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}

describe("Sprint 5 — Browser surface and tools", () => {
  let registry: SurfaceRegistry;
  let driver: MockBrowserDriver;

  beforeEach(() => {
    registry = new SurfaceRegistry();
    driver = new MockBrowserDriver();
    registry.register(new BrowserSurfaceFactory({ driverFactory: async () => driver }));
  });

  it("navigates and snapshots using browser tools", async () => {
    const navigate = createBrowserNavigateTool(registry);
    const snapshot = createBrowserSnapshotTool(registry);

    const navResult = await navigate.execute({ url: "https://example.com" }, toolContext);
    expect(navResult.ok).toBe(true);
    expect(driver.calls).toContain("navigate:https://example.com");

    const snapResult = await snapshot.execute({}, toolContext);
    expect(snapResult.ok).toBe(true);
    const data = snapResult.data as { snapshot: string };
    expect(data.snapshot).toContain("URL: https://example.com");
    expect(data.snapshot).toContain("Interactive elements:");
  });

  it("executes browser interaction tools", async () => {
    await createBrowserNavigateTool(registry).execute({ url: "https://example.com" }, toolContext);
    const tools = createBrowserInteractionTools(registry);

    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    await byName.get("browser.click")!.execute({ selector: "#submit" }, toolContext);
    await byName.get("browser.type")!.execute({ selector: "#email", text: "a@b.com" }, toolContext);
    await byName.get("browser.scroll")!.execute({ x: 0, y: 200 }, toolContext);
    await byName.get("browser.select")!.execute({ selector: "#country", value: "US" }, toolContext);
    await byName.get("browser.wait")!.execute({ selector: "#ready", timeoutMs: 50 }, toolContext);
    const screenshot = await byName.get("browser.screenshot")!.execute({ path: "artifacts/page.png" }, toolContext);

    expect(screenshot.ok).toBe(true);
    expect(driver.calls).toEqual(
      expect.arrayContaining([
        "click:#submit",
        "type:#email:a@b.com",
        "scroll:0,200",
        "select:#country:US",
        "wait:#ready:50",
        "screenshot:artifacts/page.png",
      ]),
    );
  });
});

describe("Sprint 5 — SSRF guard + web tools", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env["BRAVE_API_KEY"];
  });

  it("blocks private addresses in SSRF guard", () => {
    const guard = new SSRFGuard();
    expect(() => guard.validate("http://127.0.0.1:8080")).toThrow(/Blocked private host/);
    expect(() => guard.validate("http://192.168.1.20")).toThrow(/Blocked private host/);
    expect(() => guard.validate("http://localhost")).toThrow(/Blocked private host/);
    expect(() => guard.validate("https://example.com")).not.toThrow();
  });

  it("web.fetch applies SSRF guard and returns payload", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<h1>ok</h1>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

    const tool = createWebFetchTool(new SSRFGuard());
    const result = await tool.execute({ url: "https://example.com/" }, toolContext);

    expect(result.ok).toBe(true);
    expect((result.data as { status: number }).status).toBe(200);
    await expect(tool.execute({ url: "http://127.0.0.1/" }, toolContext)).rejects.toThrow(/Blocked private host/);
  });

  it("web.search supports duckduckgo and brave", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("duckduckgo.com")) {
        return new Response(JSON.stringify({
          RelatedTopics: [
            { Text: "Result One - Description", FirstURL: "https://example.com/1" },
            { Text: "Result Two - Description", FirstURL: "https://example.com/2" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        web: {
          results: [{ title: "Brave result", url: "https://brave.example", description: "Snippet" }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const tool = createWebSearchTool();
    const ddg = await tool.execute({ query: "vitest" }, toolContext);
    expect(ddg.ok).toBe(true);
    expect((ddg.data as { results: unknown[] }).results.length).toBeGreaterThan(0);

    process.env["BRAVE_API_KEY"] = "test-key";
    const brave = await tool.execute({ query: "typescript", provider: "brave" }, toolContext);
    expect(brave.ok).toBe(true);
    expect((brave.data as { provider: string }).provider).toBe("brave");
  });
});
