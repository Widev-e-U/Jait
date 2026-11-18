/**
 * `mcp.add_server` — lets agents register an external MCP server directly.
 *
 * Persists the server in Jait's own MCP configuration
 * (`<state dir>/mcp-servers.json`, mode 0600 — it may hold auth headers),
 * connects immediately and registers the server's tools as `mcp.<id>.<tool>`.
 * No Settings page or confirmation dialog is involved (explicit user decision).
 *
 * Secrets: header values are never returned in results, never logged and are
 * scrubbed from error messages. The config file is the only place they live.
 */

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getStateDirectory } from "../state-directory.js";
import type { ToolDefinition } from "./contracts.js";
import type { McpManager, McpServerConfig } from "./mcp-bridge.js";

export function mcpConfigPath(): string {
  return join(getStateDirectory(), "mcp-servers.json");
}

interface McpConfigFile {
  servers: McpServerConfig[];
}

export async function loadMcpServerConfigs(path = mcpConfigPath()): Promise<McpServerConfig[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<McpConfigFile>;
    return Array.isArray(parsed.servers) ? parsed.servers : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function saveMcpServerConfigs(servers: McpServerConfig[], path = mcpConfigPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ servers } satisfies McpConfigFile, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}

/** Turn a display name into an id usable inside `mcp.<id>.<tool>` names. */
export function slugifyMcpServerId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function normalizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return undefined;
  const entries: Array<[string, string]> = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string") throw new Error("headers array entries must be 'Name: value' strings");
      const idx = item.indexOf(":");
      if (idx <= 0) throw new Error("headers array entries must look like 'Name: value'");
      entries.push([item.slice(0, idx).trim(), item.slice(idx + 1).trim()]);
    }
  } else if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v !== "string") throw new Error(`header '${k}' must be a string`);
      entries.push([k.trim(), v.trim()]);
    }
  } else {
    throw new Error("headers must be an object or an array of 'Name: value' strings");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!HEADER_NAME.test(k)) throw new Error(`invalid header name '${k}'`);
    if (/[\r\n\0]/.test(v)) throw new Error(`invalid value for header '${k}'`);
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    out = out.split(secret).join("[redacted]");
    // Bearer-style values: also scrub the credential part on its own.
    const last = secret.split(/\s+/).pop();
    if (last && last !== secret && last.length >= 4) out = out.split(last).join("[redacted]");
  }
  return out;
}

export interface McpAddServerInput {
  name: string;
  transport: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string> | string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpAddServerDeps {
  manager: McpManager;
  /** Override for tests. */
  configPath?: string;
}

export function createMcpAddServerTool(deps: McpAddServerDeps): ToolDefinition<McpAddServerInput> {
  const { manager } = deps;
  // Serialize writes so concurrent adds cannot lose each other's entries.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    name: "mcp.add_server",
    displayName: "Add MCP server",
    description:
      "Register an external MCP server with Jait and make its tools available immediately — no Settings page or " +
      "confirmation needed. Pass `name`, `transport` (`http` or `stdio`), `url` (http) or `command` (+ optional `args`) " +
      "(stdio), and optional `headers` (e.g. {\"Authorization\": \"Bearer …\"}). The server is saved in Jait's MCP " +
      "configuration (re-adding the same name replaces it), connected, and its tools become available as " +
      "`mcp.<name>.<tool>` (discover them with tools.search). Header values are stored but never echoed back.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "high",
    // Explicit user decision: agents add MCP servers with no confirmation dialog.
    defaultConsentLevel: "none",
    discovery: {
      aliases: ["add mcp server", "register mcp server", "connect mcp", "mcp.add"],
      capabilities: ["register an external MCP server and expose its tools"],
      examples: ["add the openGym MCP server", "connect this MCP url with an auth header"],
    },
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Server name; becomes the id in tool names (lowercased, e.g. `opengym`)." },
        transport: { type: "string", description: "Transport type.", enum: ["http", "stdio"] },
        url: { type: "string", description: "MCP endpoint URL (required for http)." },
        command: { type: "string", description: "Executable to spawn (required for stdio)." },
        args: { type: "array", description: "Arguments for the stdio command.", items: { type: "string" } },
        headers: {
          type: "object",
          description: "HTTP headers as {Name: value} (http only). Stored securely, never echoed back.",
        },
        env: { type: "object", description: "Environment variables for the stdio process." },
        cwd: { type: "string", description: "Working directory for the stdio process." },
      },
      required: ["name", "transport"],
    },
    async execute(input) {
      let secrets: string[] = [];
      try {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const id = slugifyMcpServerId(name);
        if (!id) return { ok: false, message: "`name` must contain letters or digits" };

        const config: McpServerConfig = { id, name, transport: "streamable-http", enabled: true };
        if (input.transport === "http") {
          if (!input.url) return { ok: false, message: "`url` is required for http transport" };
          let parsed: URL;
          try { parsed = new URL(input.url); } catch { return { ok: false, message: "`url` is not a valid URL" }; }
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            return { ok: false, message: "`url` must use http or https" };
          }
          config.url = parsed.toString();
          const headers = normalizeHeaders(input.headers);
          if (headers) {
            config.headers = headers;
            secrets = Object.values(headers);
          }
        } else if (input.transport === "stdio") {
          if (!input.command?.trim()) return { ok: false, message: "`command` is required for stdio transport" };
          config.transport = "stdio";
          config.command = input.command.trim();
          if (input.args?.length) config.args = input.args.map(String);
          if (input.env) {
            config.env = { ...(input.env as Record<string, string>) };
            secrets = Object.values(config.env);
          }
          if (input.cwd) config.cwd = input.cwd;
        } else {
          return { ok: false, message: "`transport` must be 'http' or 'stdio'" };
        }

        // Persist first (replace by id), then connect.
        const path = deps.configPath ?? mcpConfigPath();
        const run = queue.then(async () => {
          const existing = await loadMcpServerConfigs(path);
          await saveMcpServerConfigs([...existing.filter((s) => s.id !== id), config], path);
        });
        queue = run.catch(() => undefined);
        await run;

        manager.removeServer(id);
        manager.addServer(config);
        const conn = await manager.connect(id);
        const tools = conn.tools.map((t) => ({ name: `mcp.${id}.${t.name}`, description: t.description }));

        if (conn.status !== "connected") {
          const error = scrub(conn.error ?? "connection failed", secrets);
          return {
            ok: false,
            message: `Saved MCP server '${id}' but could not connect: ${error}`,
            data: { id, saved: true, status: conn.status, error },
          };
        }
        return {
          ok: true,
          message: `MCP server '${id}' registered and connected with ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ") || "(none)"}`,
          data: { id, saved: true, status: conn.status, toolCount: tools.length, tools },
        };
      } catch (err) {
        return { ok: false, message: scrub(err instanceof Error ? err.message : String(err), secrets) };
      }
    },
  };
}
