import type { SurfaceRegistry } from "../surfaces/registry.js";
import { BrowserSurface } from "../surfaces/browser.js";
import { SSRFGuard } from "../security/ssrf-guard.js";
import { SandboxManager, type SandboxMountMode } from "../security/sandbox-manager.js";
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



interface BrowserSandboxStartInput {
  novncPort?: number;
  vncPort?: number;
  mountMode?: SandboxMountMode;
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
  provider?: "auto" | "openai" | "brave" | "perplexity" | "grok" | "gemini" | "kimi";
  limit?: number;
}

type FetchWithTlsInit = RequestInit & {
  tls?: { rejectUnauthorized?: boolean };
};

const DEFAULT_BROWSER_ID = "browser-default";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_WEB_SEARCH_MODEL = "gpt-5";
const DEFAULT_PERPLEXITY_MODEL = "sonar-pro";
const DEFAULT_PERPLEXITY_OPENROUTER_MODEL = "perplexity/sonar-pro";
const DEFAULT_GROK_MODEL = "grok-4-1212";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.ai/v1";
const DEFAULT_KIMI_MODEL = "moonshot-v1-128k";

type WebSearchProvider = NonNullable<WebSearchInput["provider"]>;
type ResolvedWebSearchProvider = Exclude<WebSearchProvider, "auto">;

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
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      const surface = await ensureBrowserSurface(registry, context, input.browserId);
      const snapshot = await surface.navigate(input.url, context.signal);
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
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      const surface = await ensureBrowserSurface(registry, context, input.browserId);
      const description = await surface.describe(context.signal);
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
  action: (surface: BrowserSurface, input: TInput, signal?: AbortSignal) => Promise<unknown>,
): ToolDefinition<TInput> {
  return {
    name,
    description,
    parameters: { type: "object", properties, required },
    async execute(input: TInput, context: ToolContext): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      const browserId = typeof input === "object" && input !== null && "browserId" in input
        ? String((input as { browserId?: string }).browserId ?? "") || undefined
        : undefined;
      const surface = await ensureBrowserSurface(registry, context, browserId);
      const result = await action(surface, input, context.signal);
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
      async (surface, input, signal) => {
        await surface.click(input.selector, signal);
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
      async (surface, input, signal) => {
        await surface.typeText(input.selector, input.text, signal);
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
      async (surface, input, signal) => {
        await surface.scroll(input.x, input.y, signal);
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
      async (surface, input, signal) => {
        await surface.select(input.selector, input.value, signal);
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
      async (surface, input, signal) => {
        await surface.waitFor(input.selector, input.timeoutMs ?? 10000, signal);
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
      async (surface, input, signal) => {
        const screenshotPath = await surface.screenshot(input.path, signal);
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
    async execute(input, context): Promise<ToolResult> {
      if (context?.signal?.aborted) return { ok: false, message: "Cancelled" };
      const url = guard.validate(input.url).toString();
      const timeoutMs = input.timeoutMs ?? 15000;
      const maxBytes = input.maxBytes ?? 50_000;
      const controller = new AbortController();
      // Link external abort signal to our controller so cancellation propagates
      if (context?.signal) {
        if (context.signal.aborted) { controller.abort(); }
        else { context.signal.addEventListener("abort", () => controller.abort(), { once: true }); }
      }
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
    description: "Search the public web (auto, openai, brave, perplexity, grok, gemini, kimi)",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        provider: { type: "string", description: "Provider: auto|openai|brave|perplexity|grok|gemini|kimi" },
        limit: { type: "number", description: "Maximum results to return" },
      },
      required: ["query"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (context?.signal?.aborted) return { ok: false, message: "Cancelled" };
      const requestedProvider = input.provider ?? "auto";
      const getApiKey = (name: string) =>
        normalizeApiKey(context.apiKeys?.[name]) ?? normalizeApiKey(process.env[name]);
      const provider = resolveWebSearchProvider(requestedProvider, getApiKey);
      const limit = Math.max(1, Math.min(input.limit ?? 5, 10));
      const openaiOptions = {
        apiKey: getApiKey("OPENAI_API_KEY"),
        baseUrl: normalizeApiKey(context.apiKeys?.["OPENAI_BASE_URL"]) ?? process.env["OPENAI_BASE_URL"],
        model:
          normalizeApiKey(context.apiKeys?.["OPENAI_WEB_SEARCH_MODEL"])
          ?? normalizeApiKey(context.apiKeys?.["OPENAI_MODEL"])
          ?? process.env["OPENAI_WEB_SEARCH_MODEL"]
          ?? process.env["OPENAI_MODEL"]
          ?? DEFAULT_OPENAI_WEB_SEARCH_MODEL,
      };

      if (provider === "brave") {
        const apiKey = getApiKey("BRAVE_API_KEY");
        if (!apiKey) {
          return searchOpenAI(
            guard,
            input.query,
            limit,
            openaiOptions,
            "Missing BRAVE_API_KEY, falling back to openai web_search",
          );
        }
        return searchBrave(guard, input.query, limit, apiKey);
      }

      if (provider === "perplexity") {
        const perplexityKey = getApiKey("PERPLEXITY_API_KEY");
        const openRouterKey = getApiKey("OPENROUTER_API_KEY");
        if (!perplexityKey && !openRouterKey) {
          return searchOpenAI(
            guard,
            input.query,
            limit,
            openaiOptions,
            "Missing PERPLEXITY_API_KEY/OPENROUTER_API_KEY, falling back to openai web_search",
          );
        }
        return searchPerplexity(guard, input.query, limit, { perplexityKey, openRouterKey });
      }

      if (provider === "grok") {
        const apiKey = getApiKey("XAI_API_KEY");
        if (!apiKey) {
          return searchOpenAI(
            guard,
            input.query,
            limit,
            openaiOptions,
            "Missing XAI_API_KEY, falling back to openai web_search",
          );
        }
        return searchGrok(guard, input.query, limit, apiKey);
      }

      if (provider === "gemini") {
        const apiKey = getApiKey("GEMINI_API_KEY");
        if (!apiKey) {
          return searchOpenAI(
            guard,
            input.query,
            limit,
            openaiOptions,
            "Missing GEMINI_API_KEY, falling back to openai web_search",
          );
        }
        return searchGemini(guard, input.query, limit, apiKey);
      }

      if (provider === "kimi") {
        const apiKey = getApiKey("MOONSHOT_API_KEY");
        if (!apiKey) {
          return searchOpenAI(
            guard,
            input.query,
            limit,
            openaiOptions,
            "Missing MOONSHOT_API_KEY, falling back to openai web_search",
          );
        }
        return searchKimi(guard, input.query, limit, apiKey);
      }

      if (provider === "openai") {
        return searchOpenAI(guard, input.query, limit, openaiOptions);
      }
      return searchOpenAI(
        guard,
        input.query,
        limit,
        openaiOptions,
        `Provider '${provider}' not available, using openai web_search`,
      );
    },
  };
}

function normalizeApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveWebSearchProvider(
  provider: WebSearchProvider,
  getApiKey: (name: string) => string | undefined,
): ResolvedWebSearchProvider {
  if (provider !== "auto") {
    return provider;
  }
  if (getApiKey("BRAVE_API_KEY")) return "brave";
  if (getApiKey("PERPLEXITY_API_KEY") || getApiKey("OPENROUTER_API_KEY")) {
    return "perplexity";
  }
  if (getApiKey("XAI_API_KEY")) return "grok";
  if (getApiKey("GEMINI_API_KEY")) return "gemini";
  if (getApiKey("MOONSHOT_API_KEY")) return "kimi";
  return "openai";
}

async function searchOpenAI(
  guard: SSRFGuard,
  query: string,
  limit: number,
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  },
  prefixMessage?: string,
): Promise<ToolResult> {
  const apiKey = normalizeApiKey(options.apiKey);
  if (!apiKey) {
    return {
      ok: false,
      message: `${prefixMessage ? `${prefixMessage}. ` : ""}Missing OPENAI_API_KEY`,
      data: { provider: "openai", query, results: [] },
    };
  }
  const baseUrl = options.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/responses`;
  const model = options.model?.trim() || DEFAULT_OPENAI_WEB_SEARCH_MODEL;

  try {
    const url = guard.validate(endpoint);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search" }],
        input: `Provide up to ${limit} web search results for: ${query}`,
      }),
    });
    const data = await response.json() as OpenAIWebSearchResponse;
    if (!response.ok) {
      const detail = data.error?.message || `HTTP ${response.status}`;
      return {
        ok: false,
        message: `${prefixMessage ? `${prefixMessage}. ` : ""}OpenAI web_search failed (${response.status}): ${detail}`,
        data: { provider: "openai", query, results: [] },
      };
    }

    const { results, summary } = extractOpenAIWebSearchResults(data, query, limit);
    return {
      ok: true,
      message: prefixMessage
        ? `${prefixMessage}. Search results (openai)`
        : "Search results (openai)",
      data: {
        provider: "openai",
        model,
        query,
        results,
        summary,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: `${prefixMessage ? `${prefixMessage}. ` : ""}OpenAI web_search failed: ${extractErrorMessage(err)}`,
      data: { provider: "openai", query, results: [] },
    };
  }
}

async function searchBrave(
  guard: SSRFGuard,
  query: string,
  limit: number,
  apiKey: string,
): Promise<ToolResult> {
  try {
    const url = guard.validate(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
    );
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    });
    const data = await response.json() as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const results = (data.web?.results ?? [])
      .slice(0, limit)
      .map((entry) => ({
        title: entry.title ?? "",
        url: entry.url ?? "",
        snippet: entry.description ?? "",
      }))
      .filter((entry) => entry.title || entry.url || entry.snippet);
    return {
      ok: response.ok,
      message: response.ok ? "Search results (brave)" : `Brave search failed (${response.status})`,
      data: { provider: "brave", query, results },
    };
  } catch (err) {
    return {
      ok: false,
      message: `Brave search failed: ${extractErrorMessage(err)}`,
      data: { provider: "brave", query, results: [] },
    };
  }
}

async function searchPerplexity(
  guard: SSRFGuard,
  query: string,
  limit: number,
  keys: { perplexityKey?: string; openRouterKey?: string },
): Promise<ToolResult> {
  const useOpenRouter = !keys.perplexityKey && Boolean(keys.openRouterKey);
  const apiKey = useOpenRouter ? keys.openRouterKey : keys.perplexityKey;
  if (!apiKey) {
    return {
      ok: false,
      message: "Perplexity search failed: missing API key",
      data: { provider: "perplexity", query, results: [] },
    };
  }
  const model = useOpenRouter
    ? (process.env["PERPLEXITY_OPENROUTER_MODEL"]?.trim() || DEFAULT_PERPLEXITY_OPENROUTER_MODEL)
    : (process.env["PERPLEXITY_MODEL"]?.trim() || DEFAULT_PERPLEXITY_MODEL);
  const endpoint = useOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.perplexity.ai/chat/completions";

  try {
    const url = guard.validate(endpoint);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: `Provide up to ${limit} web results for: ${query}` }],
      }),
    });
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const citationResults = (data.citations ?? [])
      .slice(0, limit)
      .map((citationUrl) => ({
        title: safeHostname(citationUrl),
        url: citationUrl,
        snippet: content.slice(0, 500),
      }));
    const results = citationResults.length > 0
      ? citationResults
      : [{ title: query, url: "", snippet: content }];
    return {
      ok: response.ok,
      message: response.ok ? "Search results (perplexity)" : `Perplexity search failed (${response.status})`,
      data: { provider: "perplexity", query, results },
    };
  } catch (err) {
    return {
      ok: false,
      message: `Perplexity search failed: ${extractErrorMessage(err)}`,
      data: { provider: "perplexity", query, results: [] },
    };
  }
}

async function searchGrok(
  guard: SSRFGuard,
  query: string,
  limit: number,
  apiKey: string,
): Promise<ToolResult> {
  const model = process.env["GROK_MODEL"]?.trim() || DEFAULT_GROK_MODEL;
  try {
    const url = guard.validate("https://api.x.ai/v1/responses");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: query,
        tools: [{ type: "web_search" }],
      }),
    });
    const data = await response.json() as {
      output_text?: string;
      citations?: string[];
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const contentFromOutput = (data.output ?? [])
      .flatMap((output) => output.content ?? [])
      .find((part) => part.type === "output_text" && typeof part.text === "string")?.text;
    const content = contentFromOutput ?? data.output_text ?? "";
    const citationResults = (data.citations ?? [])
      .slice(0, limit)
      .map((citationUrl) => ({
        title: safeHostname(citationUrl),
        url: citationUrl,
        snippet: content.slice(0, 500),
      }));
    const results = citationResults.length > 0
      ? citationResults
      : [{ title: query, url: "", snippet: content }];
    return {
      ok: response.ok,
      message: response.ok ? "Search results (grok)" : `Grok search failed (${response.status})`,
      data: { provider: "grok", query, results },
    };
  } catch (err) {
    return {
      ok: false,
      message: `Grok search failed: ${extractErrorMessage(err)}`,
      data: { provider: "grok", query, results: [] },
    };
  }
}

async function searchGemini(
  guard: SSRFGuard,
  query: string,
  limit: number,
  apiKey: string,
): Promise<ToolResult> {
  const model = process.env["GEMINI_MODEL"]?.trim() || DEFAULT_GEMINI_MODEL;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const url = guard.validate(endpoint);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
      }),
    });
    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    };
    const candidate = data.candidates?.[0];
    const content = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();
    const grounded = (candidate?.groundingMetadata?.groundingChunks ?? [])
      .map((chunk) => chunk.web)
      .filter((web): web is { uri?: string; title?: string } => Boolean(web && web.uri))
      .slice(0, limit)
      .map((web) => ({
        title: web.title ?? safeHostname(web.uri ?? ""),
        url: web.uri ?? "",
        snippet: content.slice(0, 500),
      }));
    const results = grounded.length > 0
      ? grounded
      : [{ title: query, url: "", snippet: content }];
    return {
      ok: response.ok,
      message: response.ok ? "Search results (gemini)" : `Gemini search failed (${response.status})`,
      data: { provider: "gemini", query, results },
    };
  } catch (err) {
    return {
      ok: false,
      message: `Gemini search failed: ${extractErrorMessage(err)}`,
      data: { provider: "gemini", query, results: [] },
    };
  }
}

async function searchKimi(
  guard: SSRFGuard,
  query: string,
  limit: number,
  apiKey: string,
): Promise<ToolResult> {
  const baseUrl = process.env["KIMI_BASE_URL"]?.trim() || DEFAULT_KIMI_BASE_URL;
  const model = process.env["KIMI_MODEL"]?.trim() || DEFAULT_KIMI_MODEL;
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  try {
    const url = guard.validate(endpoint);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: query }],
        tools: [{ type: "builtin_function", function: { name: "$web_search" } }],
        tool_choice: "auto",
      }),
    });
    const data = await response.json() as {
      search_results?: Array<{ title?: string; url?: string; content?: string }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const results = (data.search_results ?? [])
      .slice(0, limit)
      .map((entry) => ({
        title: entry.title ?? safeHostname(entry.url ?? ""),
        url: entry.url ?? "",
        snippet: entry.content ?? "",
      }))
      .filter((entry) => entry.title || entry.url || entry.snippet);
    if (results.length === 0) {
      results.push({
        title: query,
        url: "",
        snippet: data.choices?.[0]?.message?.content ?? "",
      });
    }
    return {
      ok: response.ok,
      message: response.ok ? "Search results (kimi)" : `Kimi search failed (${response.status})`,
      data: { provider: "kimi", query, results },
    };
  } catch (err) {
    return {
      ok: false,
      message: `Kimi search failed: ${extractErrorMessage(err)}`,
      data: { provider: "kimi", query, results: [] },
    };
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url || "source";
  }
}

type OpenAIWebSearchResponse = {
  error?: { message?: string };
  output_text?: string;
  output?: Array<{
    type?: string;
    action?: {
      sources?: Array<{ url?: string; title?: string }>;
    };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
      }>;
    }>;
  }>;
};

function extractOpenAIWebSearchResults(
  data: OpenAIWebSearchResponse,
  query: string,
  limit: number,
): { results: Array<{ title: string; url: string; snippet: string }>; summary: string } {
  const contentBlocks = (data.output ?? []).flatMap((entry) => entry.content ?? []);
  const summary = normalizeText(
    data.output_text
      || contentBlocks
        .filter((block) => block.type === "output_text" && typeof block.text === "string")
        .map((block) => block.text ?? "")
        .join("\n"),
  );

  const sourceMap = new Map<string, { title: string; url: string; snippet: string }>();
  const push = (source: { url?: string; title?: string }) => {
    const url = source.url?.trim() ?? "";
    if (!url || sourceMap.has(url)) return;
    sourceMap.set(url, {
      title: source.title?.trim() || safeHostname(url),
      url,
      snippet: summary.slice(0, 500),
    });
  };

  for (const entry of data.output ?? []) {
    for (const source of entry.action?.sources ?? []) push(source);
  }
  for (const block of contentBlocks) {
    for (const annotation of block.annotations ?? []) {
      if (annotation.type === "url_citation") {
        push(annotation);
      }
    }
  }

  const results = Array.from(sourceMap.values()).slice(0, limit);
  if (results.length === 0) {
    results.push({
      title: query,
      url: "",
      snippet: summary || "OpenAI web_search returned no citation URLs.",
    });
  }
  return { results, summary };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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


export function createBrowserSandboxStartTool(sandboxManager = new SandboxManager()): ToolDefinition<BrowserSandboxStartInput> {
  return {
    name: "browser.sandbox.start",
    description: "Start Chromium sandbox container with noVNC access",
    parameters: {
      type: "object",
      properties: {
        novncPort: { type: "number", description: "Host noVNC port (default 6080)" },
        vncPort: { type: "number", description: "Host VNC port (default 5900)" },
        mountMode: { type: "string", description: "Workspace mount mode: none, read-only, read-write" },
      },
      required: [],
    },
    async execute(input, context): Promise<ToolResult> {
      const result = await sandboxManager.startBrowserSandbox({
        workspaceRoot: context.workspaceRoot,
        novncPort: input.novncPort,
        vncPort: input.vncPort,
        mountMode: input.mountMode ?? "read-only",
      });

      return {
        ok: true,
        message: "Sandbox browser started",
        data: result,
      };
    },
  };
}
