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
  ignoreTlsErrors?: boolean;
}

interface WebSearchInput {
  query: string;
  provider?: "duckduckgo" | "brave" | "perplexity";
  limit?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

type FetchWithTlsInit = RequestInit & {
  tls?: { rejectUnauthorized?: boolean };
};

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
        ignoreTlsErrors: { type: "boolean", description: "Allow retry with TLS verification disabled" },
      },
      required: ["url"],
    },
    async execute(input): Promise<ToolResult> {
      const url = guard.validate(input.url).toString();
      const timeoutMs = input.timeoutMs ?? 15000;
      const maxBytes = input.maxBytes ?? 50_000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const ignoreTlsErrors =
        input.ignoreTlsErrors === true || process.env["WEB_FETCH_IGNORE_TLS_ERRORS"] === "true";
      try {
        const { response, insecureTlsUsed } = await fetchWithTlsFallback(
          url,
          {
            method: input.method ?? "GET",
            body: input.body,
            headers: input.headers,
            signal: controller.signal,
          },
          ignoreTlsErrors,
        );
        const text = await response.text();
        return {
          ok: response.ok,
          message: response.ok
            ? insecureTlsUsed
              ? `Fetched ${url} (TLS verification disabled)`
              : `Fetched ${url}`
            : `Request failed with ${response.status}`,
          data: {
            url,
            status: response.status,
            contentType: response.headers.get("content-type"),
            body: text.slice(0, maxBytes),
            insecureTlsUsed,
          },
        };
      } catch (err) {
        const message = extractErrorMessage(err);
        return {
          ok: false,
          message: `Fetch failed: ${message}`,
          data: { url, error: message },
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

      return searchDuckDuckGo(guard, input.query, limit);
    },
  };
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isTlsFailure(err: unknown): boolean {
  const msg = extractErrorMessage(err).toLowerCase();
  return (
    msg.includes("certificate") ||
    msg.includes("self signed") ||
    msg.includes("unable to get local issuer certificate") ||
    msg.includes("tls")
  );
}

async function fetchWithTlsFallback(
  url: string,
  init: FetchWithTlsInit,
  allowInsecureTls: boolean,
): Promise<{ response: Response; insecureTlsUsed: boolean }> {
  try {
    const response = await fetch(url, init);
    return { response, insecureTlsUsed: false };
  } catch (err) {
    if (!allowInsecureTls || !isTlsFailure(err)) throw err;
    const retryInit: FetchWithTlsInit = {
      ...init,
      tls: { rejectUnauthorized: false },
    };
    const response = await fetch(url, retryInit);
    return { response, insecureTlsUsed: true };
  }
}

async function searchDuckDuckGo(
  guard: SSRFGuard,
  query: string,
  limit: number,
): Promise<ToolResult> {
  const jsonUrl = guard.validate(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
  );
  const htmlUrl = guard.validate(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);

  try {
    const jsonResponse = await fetch(jsonUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JaitBot/1.0; +https://jait.local)",
      },
    });
    if (jsonResponse.ok) {
      const data = await jsonResponse.json() as {
        Results?: Array<{ Text?: string; FirstURL?: string }>;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }>;
      };
      const jsonResults = extractDdgJsonResults(data, limit);
      if (jsonResults.length > 0) {
        return {
          ok: true,
          message: "Search results (duckduckgo)",
          data: { provider: "duckduckgo", query, results: jsonResults },
        };
      }
    }
  } catch {
    // Continue to HTML fallback.
  }

  try {
    const htmlResponse = await fetch(htmlUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; JaitBot/1.0; +https://jait.local)",
      },
    });
    const html = await htmlResponse.text();
    const results = extractDdgHtmlResults(html, limit);
    return {
      ok: htmlResponse.ok,
      message: results.length > 0 ? "Search results (duckduckgo html fallback)" : "No search results (duckduckgo)",
      data: { provider: "duckduckgo", query, results },
    };
  } catch (err) {
    const message = extractErrorMessage(err);
    return {
      ok: false,
      message: `DuckDuckGo search failed: ${message}`,
      data: { provider: "duckduckgo", query, results: [] },
    };
  }
}

function extractDdgJsonResults(
  data: {
    Results?: Array<{ Text?: string; FirstURL?: string }>;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }>;
  },
  limit: number,
): SearchResult[] {
  const flat: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }> = [
    ...(data.Results ?? []),
    ...(data.RelatedTopics ?? []),
  ];
  const out: SearchResult[] = [];

  const visit = (node: { Text?: string; FirstURL?: string; Topics?: unknown[] }) => {
    if (out.length >= limit) return;
    if (node.FirstURL) {
      const fullText = node.Text ?? "";
      const [titlePart, ...snippetParts] = fullText.split(" - ");
      out.push({
        title: titlePart || node.FirstURL,
        url: node.FirstURL,
        snippet: snippetParts.join(" - ") || fullText,
      });
      return;
    }
    if (Array.isArray(node.Topics)) {
      for (const child of node.Topics) {
        if (typeof child === "object" && child !== null) {
          visit(child as { Text?: string; FirstURL?: string; Topics?: unknown[] });
        }
        if (out.length >= limit) return;
      }
    }
  };

  for (const node of flat) {
    visit(node);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function extractDdgHtmlResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkRegex)) {
    const rawUrl = match[1] ?? "";
    const title = decodeHtmlEntities(stripHtml(match[2] ?? "")).trim();
    const url = normalizeDuckDuckGoUrl(rawUrl);
    if (!url || !title) continue;
    results.push({ title, url, snippet: "" });
    if (results.length >= limit) break;
  }
  return results;
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  try {
    if (rawUrl.startsWith("//")) return `https:${rawUrl}`;
    if (rawUrl.startsWith("/l/?")) {
      const parsed = new URL(`https://duckduckgo.com${rawUrl}`);
      const target = parsed.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
