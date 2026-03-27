import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SurfaceRegistry } from "./surfaces/registry.js";
import {
  BrowserSurfaceFactory,
  type BrowserDriver,
  type BrowserPageSnapshot,
  type BrowserPerformanceMetrics,
} from "./surfaces/browser.js";
import {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInspectTool,
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
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
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
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
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
    const data = snapResult.data as {
      snapshot: string;
      activeElement: { selector: string };
      dialogs: Array<{ title: string }>;
      obstruction: { hasModal: boolean };
      interactiveElements: Array<{ selectors: Array<{ kind: string }> }>;
    };
    expect(data.snapshot).toContain("URL: https://example.com");
    expect(data.snapshot).toContain("Interactive elements:");
    expect(data.snapshot).toContain("Active element:");
    expect(data.activeElement.selector).toBe("#email");
    expect(data.dialogs[0]?.title).toBe("Sign in");
    expect(data.obstruction.hasModal).toBe(true);
    expect(data.interactiveElements[0]?.selectors[0]?.kind).toBe("id");
  });

  it("returns structured browser inspection data", async () => {
    await createBrowserNavigateTool(registry).execute({ url: "https://example.com" }, toolContext);
    const inspect = createBrowserInspectTool(registry);

    const result = await inspect.execute({ selector: "#submit" }, toolContext);

    expect(result.ok).toBe(true);
    const data = result.data as {
      target: { selector: string; obscured: boolean; interceptedBy: { role: string } };
      activeElement: { selector: string };
      dialogs: Array<{ title: string }>;
    };
    expect(data.target.selector).toBe("#submit");
    expect(data.target.obscured).toBe(true);
    expect(data.target.interceptedBy.role).toBe("dialog");
    expect(data.activeElement.selector).toBe("#email");
    expect(data.dialogs[0]?.title).toBe("Sign in");
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

  it("adds obstruction diagnostics to click failures", async () => {
    await createBrowserNavigateTool(registry).execute({ url: "https://example.com" }, toolContext);
    driver.failClickSelector = "#submit";
    const tools = createBrowserInteractionTools(registry);
    const click = tools.find((tool) => tool.name === "browser.click");

    await expect(click!.execute({ selector: "#submit" }, toolContext)).rejects.toThrow(
      /Click may be intercepted|Another element is receiving pointer hits|inside dialog/i,
    );
  });

  it("redacts browser captures and suppresses screenshots for secret-safe sessions", async () => {
    const collaboration = {
      assertAgentControl: vi.fn(),
      getSessionByBrowserId: vi.fn().mockReturnValue({
        id: "bs_secret",
        secretSafe: true,
        controller: "agent",
      }),
    };

    await createBrowserNavigateTool(registry, collaboration as any).execute({ url: "https://example.com" }, toolContext);

    const snapshot = await createBrowserSnapshotTool(registry, collaboration as any).execute({}, toolContext);
    expect(snapshot.ok).toBe(true);
    expect(snapshot.message).toContain("secret-safe");
    expect(snapshot.data).toMatchObject({
      captureSuppressed: true,
      textPreview: "",
      interactiveElements: [],
      activeElement: null,
      dialogs: [],
      obstruction: null,
    });

    const inspect = await createBrowserInspectTool(registry, collaboration as any).execute({ selector: "#submit" }, toolContext);
    expect(inspect.ok).toBe(true);
    expect(inspect.message).toContain("secret-safe");
    expect(inspect.data).toMatchObject({
      captureSuppressed: true,
      target: null,
      dialogs: [],
    });

    const screenshotTool = createBrowserInteractionTools(registry, collaboration as any)
      .find((tool) => tool.name === "browser.screenshot");
    const screenshot = await screenshotTool!.execute({ path: "artifacts/page-secret.png" }, toolContext);
    expect(screenshot.ok).toBe(false);
    expect(screenshot.message).toContain("secret-safe");
    expect(driver.calls).not.toContain("screenshot:artifacts/page-secret.png");
  });
});

describe("Sprint 5 — SSRF guard + web tools", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_WEB_SEARCH_MODEL"];
    delete process.env["BRAVE_API_KEY"];
    delete process.env["PERPLEXITY_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["XAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["MOONSHOT_API_KEY"];
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

  it("web.search auto mode uses openai and supports brave with API key", async () => {
    process.env["OPENAI_API_KEY"] = "test-openai";
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/responses")) {
        return new Response(JSON.stringify({
          output_text: "SQLite WAL notes",
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { url: "https://sqlite.org/wal.html", title: "SQLite WAL" },
                ],
              },
            },
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
    const auto = await tool.execute({ query: "vitest" }, toolContext);
    expect(auto.ok).toBe(true);
    expect((auto.data as { provider: string }).provider).toBe("openai");
    expect((auto.data as { results: unknown[] }).results.length).toBeGreaterThan(0);

    process.env["BRAVE_API_KEY"] = "test-key";
    const brave = await tool.execute({ query: "typescript", provider: "brave" }, toolContext);
    expect(brave.ok).toBe(true);
    expect((brave.data as { provider: string }).provider).toBe("brave");
  });

  it("web.search falls back to openai when keyed provider key is missing", async () => {
    process.env["OPENAI_API_KEY"] = "test-openai";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/responses")) {
        return new Response(JSON.stringify({
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { title: "Fallback Result", url: "https://fallback.example" },
                ],
              },
            },
          ],
          output_text: "Fallback snippet",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const tool = createWebSearchTool();
    const result = await tool.execute({ query: "sqlite wal", provider: "grok" }, toolContext);
    expect(result.ok).toBe(true);
    expect((result.data as { provider: string }).provider).toBe("openai");
    expect(result.message).toContain("Missing XAI_API_KEY");
  });

  it("web.search openai provider fails clearly when OPENAI_API_KEY is missing", async () => {
    const tool = createWebSearchTool();
    const result = await tool.execute({ query: "SQLite WAL mode best practices", provider: "openai", limit: 5 }, toolContext);
    expect(result.ok).toBe(false);
    expect((result.data as { provider: string }).provider).toBe("openai");
    expect(result.message).toContain("Missing OPENAI_API_KEY");
  });
});
