import type { SurfaceRegistry } from "../surfaces/registry.js";
import { BrowserSurface } from "../surfaces/browser.js";
import { SSRFGuard } from "../security/ssrf-guard.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

interface BrowserNavigateInput {
  url: string;
  browserId?: string;
}

interface BrowserSnapshotInput {
  browserId?: string;
}

interface BrowserClickInput {
  selector: string;
  browserId?: string;
}

interface BrowserTypeInput {
  selector: string;
  text: string;
  browserId?: string;
}

interface BrowserScrollInput {
  x: number;
  y: number;
  browserId?: string;
}

interface BrowserSelectInput {
  selector: string;
  value: string;
  browserId?: string;
}

interface BrowserWaitInput {
  selector: string;
  timeoutMs?: number;
  browserId?: string;
}

interface BrowserScreenshotInput {
  path?: string;
  browserId?: string;
}

interface WebFetchInput {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}

interface WebSearchInput {
  query: string;
  provider?: "duckduckgo" | "brave" | "perplexity";
  limit?: number;
}

const DEFAULT_BROWSER_ID = "browser-default";

async function ensureBrowserSurface(registry: SurfaceRegistry, context: ToolContext, browserId?: string): Promise<BrowserSurface> {
  const id = browserId ?? DEFAULT_BROWSER_ID;
  const existing = registry.getSurface(id);
  if (existing?.type === "browser" && existing.state === "running") {
    return existing as BrowserSurface;
  }
  const started = await registry.startSurface("browser", id, {
    sessionId: context.sessionId,
    workspaceRoot: context.workspaceRoot,
  });
  if (started.type !== "browser") {
    throw new Error(`Surface '${id}' is not a browser surface`);
  }
  return started as BrowserSurface;
}

export function createBrowserNavigateTool(registry: SurfaceRegistry): ToolDefinition<BrowserNavigateInput> {
  return {
    name: "browser.navigate",
    description: "Navigate the browser to a URL and return a page summary",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "HTTP/HTTPS URL to open" },
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
      required: ["url"],
    },
    async execute(input, context): Promise<ToolResult> {
      const surface = await ensureBrowserSurface(registry, context, input.browserId);
      const snapshot = await surface.navigate(input.url);
      return {
        ok: true,
        message: `Navigated to ${snapshot.url}`,
        data: {
          browserId: surface.id,
          url: snapshot.url,
          title: snapshot.title,
          textPreview: snapshot.text.slice(0, 500),
          interactiveElements: snapshot.elements.slice(0, 10),
        },
      };
    },
  };
}

export function createBrowserSnapshotTool(registry: SurfaceRegistry): ToolDefinition<BrowserSnapshotInput> {
  return {
    name: "browser.snapshot",
    description: "Return a structured textual browser snapshot for the current page",
    parameters: {
      type: "object",
      properties: {
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      const surface = await ensureBrowserSurface(registry, context, input.browserId);
      const description = await surface.describe();
      return {
        ok: true,
        message: "Browser snapshot captured",
        data: { browserId: surface.id, snapshot: description },
      };
    },
  };
}

function makeActionTool<TInput>(
  registry: SurfaceRegistry,
  name: string,
  description: string,
  properties: Record<string, { type: string; description: string }>,
  required: string[],
  action: (surface: BrowserSurface, input: TInput) => Promise<unknown>,
): ToolDefinition<TInput> {
  return {
    name,
    description,
    parameters: { type: "object", properties, required },
    async execute(input: TInput, context: ToolContext): Promise<ToolResult> {
      const browserId = typeof input === "object" && input !== null && "browserId" in input
        ? String((input as { browserId?: string }).browserId ?? "") || undefined
        : undefined;
      const surface = await ensureBrowserSurface(registry, context, browserId);
      const result = await action(surface, input);
      return {
        ok: true,
        message: `${name} executed`,
        data: { browserId: surface.id, result },
      };
    },
  };
}

export function createBrowserInteractionTools(registry: SurfaceRegistry): ToolDefinition[] {
  return [
    makeActionTool<BrowserClickInput>(
      registry,
      "browser.click",
      "Click an element by CSS selector",
      {
        selector: { type: "string", description: "CSS selector for the target element" },
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
      ["selector"],
      async (surface, input) => {
        await surface.click(input.selector);
        return { selector: input.selector };
      },
    ),
    makeActionTool<BrowserTypeInput>(
      registry,
      "browser.type",
      "Type text into an element selected by CSS selector",
      {
        selector: { type: "string", description: "CSS selector for the target input" },
        text: { type: "string", description: "Text to type" },
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
      ["selector", "text"],
      async (surface, input) => {
        await surface.typeText(input.selector, input.text);
        return { selector: input.selector };
      },
    ),
    makeActionTool<BrowserScrollInput>(
      registry,
      "browser.scroll",
      "Scroll the browser viewport",
      {
        x: { type: "number", description: "Horizontal scroll position" },
        y: { type: "number", description: "Vertical scroll position" },
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
      ["x", "y"],
      async (surface, input) => {
        await surface.scroll(input.x, input.y);
        return { x: input.x, y: input.y };
      },
    ),
    makeActionTool<BrowserSelectInput>(
      registry,
      "browser.select",
      "Select a value from a select element",
      {
        selector: { type: "string", description: "CSS selector for the select element" },
        value: { type: "string", description: "Option value to choose" },
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
      ["selector", "value"],
      async (surface, input) => {
        await surface.select(input.selector, input.value);
        return { selector: input.selector, value: input.value };
      },
    ),
    makeActionTool<BrowserWaitInput>(
      registry,
      "browser.wait",
      "Wait for an element to appear",
      {
        selector: { type: "string", description: "CSS selector to wait for" },
        timeoutMs: { type: "number", description: "Timeout in milliseconds (default 10000)" },
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
      ["selector"],
      async (surface, input) => {
        await surface.waitFor(input.selector, input.timeoutMs ?? 10000);
        return { selector: input.selector, timeoutMs: input.timeoutMs ?? 10000 };
      },
    ),
    makeActionTool<BrowserScreenshotInput>(
      registry,
      "browser.screenshot",
      "Capture a browser screenshot",
      {
        path: { type: "string", description: "Optional output file path" },
        browserId: { type: "string", description: "Optional browser surface ID" },
      },
      [],
      async (surface, input) => {
        const screenshotPath = await surface.screenshot(input.path);
        return { path: screenshotPath };
      },
    ),
  ];
}

export function createWebFetchTool(guard = new SSRFGuard()): ToolDefinition<WebFetchInput> {
  return {
    name: "web.fetch",
    description: "Fetch URL content with SSRF protections for public web access",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public URL to fetch" },
        method: { type: "string", description: "HTTP method" },
        body: { type: "string", description: "Request body" },
        timeoutMs: { type: "number", description: "Request timeout in ms" },
      },
      required: ["url"],
    },
    async execute(input): Promise<ToolResult> {
      const url = guard.validate(input.url).toString();
      const timeoutMs = input.timeoutMs ?? 15000;
      const maxBytes = input.maxBytes ?? 50_000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: input.method ?? "GET",
          body: input.body,
          headers: input.headers,
          signal: controller.signal,
        });
        const text = await response.text();
        return {
          ok: response.ok,
          message: response.ok ? `Fetched ${url}` : `Request failed with ${response.status}`,
          data: {
            url,
            status: response.status,
            contentType: response.headers.get("content-type"),
            body: text.slice(0, maxBytes),
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createWebSearchTool(guard = new SSRFGuard()): ToolDefinition<WebSearchInput> {
  return {
    name: "web.search",
    description: "Search the public web (duckduckgo, brave, or perplexity)",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        provider: { type: "string", description: "Provider: duckduckgo|brave|perplexity" },
        limit: { type: "number", description: "Maximum results to return" },
      },
      required: ["query"],
    },
    async execute(input): Promise<ToolResult> {
      const provider = input.provider ?? "duckduckgo";
      const limit = Math.max(1, Math.min(input.limit ?? 5, 10));

      if (provider === "brave") {
        const apiKey = process.env["BRAVE_API_KEY"];
        if (!apiKey) return { ok: false, message: "Missing BRAVE_API_KEY" };
        const url = guard.validate(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(input.query)}`);
        const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } });
        const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
        const results = (data.web?.results ?? []).slice(0, limit).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.description ?? "" }));
        return { ok: response.ok, message: `Search results (${provider})`, data: { provider, query: input.query, results } };
      }

      if (provider === "perplexity") {
        const apiKey = process.env["PERPLEXITY_API_KEY"];
        if (!apiKey) return { ok: false, message: "Missing PERPLEXITY_API_KEY" };
        const url = guard.validate("https://api.perplexity.ai/chat/completions");
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [{ role: "user", content: `Provide up to ${limit} web results for: ${input.query}` }],
          }),
        });
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        return {
          ok: response.ok,
          message: `Search results (${provider})`,
          data: {
            provider,
            query: input.query,
            results: [{ title: input.query, url: "", snippet: data.choices?.[0]?.message?.content ?? "" }],
          },
        };
      }

      const ddgUrl = guard.validate(`https://duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json`);
      const response = await fetch(ddgUrl, { headers: { Accept: "application/json" } });
      const data = await response.json() as { RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> };
      const results = (data.RelatedTopics ?? [])
        .flatMap((item) => ("FirstURL" in item ? [item] : []))
        .slice(0, limit)
        .map((item) => ({
          title: item.Text?.split(" - ")[0] ?? "",
          url: item.FirstURL ?? "",
          snippet: item.Text ?? "",
        }));
      return { ok: response.ok, message: "Search results (duckduckgo)", data: { provider: "duckduckgo", query: input.query, results } };
    },
  };
}
