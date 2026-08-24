/**
 * PrimaryLink — link a deployed gateway to an upstream/primary gateway as a
 * browseable filesystem node.
 *
 * When `JAIT_PRIMARY_GATEWAY` is configured, this gateway opens an outbound
 * WebSocket to the primary, registers itself via `fs.register-node`, and then
 * answers the primary's `fs.browse-request` / `fs.roots-request` /
 * `fs.op-request` messages from its own local disk. This makes the node appear
 * (and be openable/editable) in the primary's Open Project modal — mirroring
 * exactly what the Electron desktop client does, so the primary needs zero
 * changes (it reuses its existing proxyFsBrowse/proxyFsRoots/proxyFsOp paths).
 *
 * The link is purely additive and off by default: with no primary configured,
 * nothing here runs.
 */

import { WebSocket } from "ws";
import { readFile, writeFile, mkdir, readdir, stat as fsStat, access } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir, hostname, platform } from "node:os";
import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { NODE_PROTOCOL_VERSION } from "@jait/shared";
import { TerminalSurface } from "../surfaces/terminal.js";
import type { ToolResult } from "../tools/contracts.js";
import {
  PROJECT_SEARCH_DEFAULT_RESULTS,
  ProjectSearchUnavailableError,
  normalizeProjectSearchLimit,
  searchProject,
  type ProjectSearchMode,
} from "./project-search.js";

const execAsync = promisify(exec);

/** Tail of a background command's output reported back to the gateway. */
const BACKGROUND_MAX_OUTPUT_CHARS = 4000;
const BACKGROUND_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Directories to hide from browse listings (mirror of routes/filesystem.ts) */
const HIDDEN = new Set([
  "$RECYCLE.BIN", "System Volume Information", "$WinREAgent",
  "DumpStack.log.tmp", "pagefile.sys", "hiberfil.sys", "swapfile.sys",
]);

type FsPlatform = "windows" | "macos" | "linux" | "android" | "ios";

interface BrowseEntry { name: string; path: string; type: "dir" | "file" }

export interface PrimaryLinkOptions {
  /** Primary gateway URL — http(s)://, ws(s)://, or bare host:port. */
  primaryGateway: string;
  /** Optional bearer token (JWT) for the primary's WS auth. */
  primaryToken?: string;
  /** Display name for this node (defaults to hostname). */
  nodeName?: string;
  /** Optional provider list to advertise (e.g. detected CLIs). */
  providers?: string[];
}

// Every tool this headless node can execute remotely. MUST stay in sync with
// REMOTE_EXECUTABLE_TOOLS in packages/gateway/src/tools/remote-executor.ts —
// the gateway only proxies tools in that allow-list, and every entry there
// must be implemented here (and in the desktop app's electron-main.ts).
const NODE_TOOLS = [
  "terminal.run",
  "jait.terminal",
  "execute",
  "read",
  "file.read",
  "edit",
  "file.write",
  "file.patch",
  "file.list",
  "file.stat",
  "image.view",
  "search",
  "file.search",
  "os.query",
] as const;

function detectPlatform(): FsPlatform {
  const p = platform();
  if (p === "win32") return "windows";
  if (p === "darwin") return "macos";
  return "linux";
}

/** Stable per-machine node id, persisted under ~/.jait/node-id. */
function getNodeId(): string {
  try {
    const idPath = join(homedir(), ".jait", "node-id");
    if (existsSync(idPath)) {
      const existing = readFileSync(idPath, "utf-8").trim();
      if (existing) return existing;
    }
    const id = `node-${randomUUID()}`;
    mkdir(dirname(idPath), { recursive: true }).catch(() => {});
    writeFileSync(idPath, id, "utf-8");
    return id;
  } catch {
    // Fall back to a hostname-derived id if persistence fails.
    return `node-${hostname()}`;
  }
}

/** Normalize a primary gateway URL into a ws:// or wss:// origin. */
function toWsUrl(input: string, token?: string): string {
  let url = input.trim();
  if (/^https:\/\//i.test(url)) url = url.replace(/^https:\/\//i, "wss://");
  else if (/^http:\/\//i.test(url)) url = url.replace(/^http:\/\//i, "ws://");
  else if (!/^wss?:\/\//i.test(url)) url = `ws://${url}`;
  // Strip any trailing slash, then add the token query if provided.
  url = url.replace(/\/+$/, "");
  if (token) url += `?token=${encodeURIComponent(token)}`;
  return url;
}

export type PrimaryProjectSearchResult =
  | {
      query: string;
      mode: "files";
      files: Array<{ path: string; name: string }>;
      limited: boolean;
    }
  | {
      query: string;
      mode: "content";
      matches: Array<{ file: string; line: number; content: string }>;
      limited: boolean;
    };

export async function runPrimaryProjectSearch(options: {
  root: string;
  query: string;
  mode: ProjectSearchMode;
  limit?: number;
  include?: string;
  isRegexp?: boolean;
  includeIgnoredFiles?: boolean;
}): Promise<PrimaryProjectSearchResult> {
  const result = await searchProject(options);
  if (result.mode === "files") {
    return {
      query: result.query,
      mode: result.mode,
      limited: result.limited,
      files: result.files.map(({ relativePath, name }) => ({ path: relativePath, name })),
    };
  }
  return {
    query: result.query,
    mode: result.mode,
    limited: result.limited,
    matches: result.matches.map(({ relativePath, line, content }) => ({
      file: relativePath,
      line,
      content,
    })),
  };
}

export async function runPrimarySearchTool(
  args: Record<string, unknown>,
  projectRoot?: string,
): Promise<ToolResult> {
  const pattern = String(args["pattern"] ?? args["query"] ?? "");
  const mode: ProjectSearchMode = args["mode"] === "files" ? "files" : "content";
  const baseRoot = resolve(projectRoot ?? homedir());
  const requestedPath = typeof args["path"] === "string" ? args["path"] : "";
  const root = requestedPath ? resolve(baseRoot, requestedPath) : baseRoot;

  try {
    const limit = normalizeProjectSearchLimit(args["limit"], PROJECT_SEARCH_DEFAULT_RESULTS);
    const include = typeof args["include"] === "string" ? args["include"] : undefined;
    const includeIgnoredFiles = args["includeIgnoredFiles"] === true;
    if (mode === "files") {
      const result = await searchProject({
        root,
        query: pattern,
        mode,
        limit,
        includeIgnoredFiles,
      });
      if (result.mode !== "files") throw new Error("Unexpected project search mode");
      const files = result.files.map((file) => file.path);
      const suffix = result.limited
        ? ` (stopped at the ${limit}-result limit — narrow the pattern to see the rest)`
        : "";
      return {
        ok: true,
        message: files.length === 0
          ? `No files matching "${pattern}"`
          : `Found ${files.length} file${files.length === 1 ? "" : "s"} matching "${pattern}"${suffix}`,
        data: { pattern, files },
      };
    }

    const runContentSearch = (isRegexp: boolean) => searchProject({
      root,
      query: pattern,
      mode,
      limit,
      include,
      isRegexp,
      includeIgnoredFiles,
    });
    const initialMode = args["isRegexp"] === true;
    let retriedAs: "regex" | "literal" | null = null;
    let degradedFromRegex = false;
    let result;
    try {
      result = await runContentSearch(initialMode);
    } catch (error) {
      if (
        !initialMode
        || !(error instanceof ProjectSearchUnavailableError)
        || error.reason !== "regexp_requires_rg"
      ) throw error;
      // Regex needs ripgrep, which is missing; run the pattern as literal text
      // and say so rather than failing the call.
      result = await runContentSearch(false);
      degradedFromRegex = true;
    }
    if (result.mode !== "content") throw new Error("Unexpected project search mode");
    if (result.matches.length === 0 && !degradedFromRegex) {
      // Opportunistic retry with the opposite interpretation; if the pattern is
      // not valid the other way, keep the original empty result.
      try {
        const retry = await runContentSearch(!initialMode);
        if (retry.mode !== "content") throw new Error("Unexpected project search mode");
        if (retry.matches.length > 0) {
          result = retry;
          retriedAs = initialMode ? "literal" : "regex";
        }
      } catch {
        // Keep the original empty result.
      }
    }
    const matches = result.matches.map(({ file, line, content }) => ({ file, line, content }));
    const limitSuffix = result.limited
      ? ` (stopped at the ${limit}-result limit — narrow the pattern to see the rest)`
      : "";
    const retrySuffix = retriedAs ? ` (retried as ${retriedAs})` : "";
    return {
      ok: true,
      message: (matches.length === 0
        ? `No matches for "${pattern}"`
        : `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for "${pattern}"${limitSuffix}${retrySuffix}`)
        + (degradedFromRegex
          ? " — searched as literal text because regex needs ripgrep, which is not installed."
          : ""),
      data: { pattern, matches },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Search failed" };
  }
}

export class PrimaryLink {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly terminalSessions = new Map<string, TerminalSurface>();
  private readonly nodeId = getNodeId();

  constructor(private readonly opts: PrimaryLinkOptions) {}

  start(): void {
    if (this.stopped) return;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    for (const terminal of this.terminalSessions.values()) {
      terminal.stop({ reason: "primary link stopped" }).catch(() => {});
    }
    this.terminalSessions.clear();
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    const url = toWsUrl(this.opts.primaryGateway, this.opts.primaryToken);
    const display = url.replace(/token=[^&]+/, "token=***");
    console.log(`[primary-link] connecting to primary gateway ${display} as node ${this.nodeId}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error(`[primary-link] failed to open WS: ${err instanceof Error ? err.message : String(err)}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectDelay = 1000;
      console.log(`[primary-link] connected — registering fs node`);
      const nodeName = this.opts.nodeName?.trim() || hostname();
      const platform = detectPlatform();
      const providers = this.opts.providers ?? [];
      this.send({
        type: "node.hello",
        payload: {
          id: this.nodeId,
          name: nodeName,
          platform,
          role: "remote",
          protocolVersion: NODE_PROTOCOL_VERSION,
          capabilities: {
            providers,
            surfaces: ["filesystem", "terminal"],
            tools: [...NODE_TOOLS],
            screenShare: false,
            voice: false,
            preview: false,
          },
        },
      });
      this.send({
        type: "fs.register-node",
        payload: {
          id: this.nodeId,
          name: nodeName,
          platform,
          providers,
        },
      });
    });

    ws.on("message", (raw) => {
      let msg: { type?: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      void this.handleMessage(msg);
    });

    ws.on("close", () => {
      if (this.stopped) return;
      console.log(`[primary-link] disconnected from primary — will reconnect`);
      this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      console.error(`[primary-link] socket error: ${err instanceof Error ? err.message : String(err)}`);
      // 'close' will follow and trigger reconnect.
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async handleMessage(msg: { type?: string; payload?: Record<string, unknown> }): Promise<void> {
    const payload = (msg.payload ?? {}) as Record<string, unknown>;
    switch (msg.type) {
      case "fs.browse-request": {
        const requestId = String(payload["requestId"] ?? "");
        try {
          const result = await this.browse(String(payload["path"] ?? homedir()));
          this.send({ type: "fs.browse-response", payload: { requestId, ...result } });
        } catch (err) {
          this.send({ type: "fs.browse-response", payload: { requestId, error: errMsg(err) } });
        }
        break;
      }
      case "fs.roots-request": {
        const requestId = String(payload["requestId"] ?? "");
        try {
          this.send({ type: "fs.roots-response", payload: { requestId, roots: this.roots() } });
        } catch (err) {
          this.send({ type: "fs.roots-response", payload: { requestId, error: errMsg(err) } });
        }
        break;
      }
      case "fs.op-request": {
        const requestId = String(payload["requestId"] ?? "");
        const { requestId: _omit, op, ...params } = payload as { requestId?: string; op?: string } & Record<string, unknown>;
        void _omit;
        try {
          const result = await this.fsOp(String(op ?? ""), params);
          this.send({ type: "fs.op-response", payload: { requestId, result } });
        } catch (err) {
          this.send({ type: "fs.op-response", payload: { requestId, error: errMsg(err) } });
        }
        break;
      }
      case "tool.op-request": {
        const requestId = String(payload["requestId"] ?? "");
        const tool = String(payload["tool"] ?? "");
        const args = (payload["args"] ?? {}) as Record<string, unknown>;
        const projectRoot = typeof payload["projectRoot"] === "string"
          ? payload["projectRoot"]
          : undefined;
        const backgroundId = typeof payload["backgroundId"] === "string"
          ? payload["backgroundId"]
          : undefined;
        try {
          const result = await this.toolOp(tool, args, projectRoot, backgroundId);
          this.send({ type: "tool.op-response", payload: { requestId, result } });
        } catch (err) {
          this.send({ type: "tool.op-response", payload: { requestId, error: errMsg(err) } });
        }
        break;
      }
      case "terminal.op-request": {
        const requestId = typeof payload["requestId"] === "string" ? payload["requestId"] : "";
        const op = String(payload["op"] ?? "");
        try {
          const result = await this.terminalOp(op, payload);
          if (requestId) this.send({ type: "terminal.op-response", payload: { requestId, result } });
        } catch (err) {
          if (requestId) this.send({ type: "terminal.op-response", payload: { requestId, error: errMsg(err) } });
        }
        break;
      }
      default:
        // Provider requests are not served here; the headless node exposes
        // filesystem and terminal/tool execution to the primary gateway.
        break;
    }
  }

  private async terminalOp(op: string, params: Record<string, unknown>): Promise<unknown> {
    const terminalId = String(params["terminalId"] ?? "");
    if (!terminalId) throw new Error("Missing terminalId");

    switch (op) {
      case "start": {
        const existing = this.terminalSessions.get(terminalId);
        if (existing) {
          const snapshot = existing.snapshot();
          return { ok: true, pid: snapshot.metadata.pid ?? null, shell: snapshot.metadata.shell ?? null, reused: true };
        }
        if (params["reuseOnly"] === true) {
          throw new Error(`Terminal ${terminalId} is not running on this node`);
        }
        const projectRoot = resolve(String(params["projectRoot"] ?? process.cwd()));
        const sessionId = String(params["sessionId"] ?? "default");
        const shell = typeof params["shell"] === "string" ? params["shell"] : undefined;
        const cols = typeof params["cols"] === "number" ? params["cols"] : 120;
        const rows = typeof params["rows"] === "number" ? params["rows"] : 30;
        const terminal = new TerminalSurface(terminalId, { ...(shell ? { shell } : {}), cols, rows });
        terminal.onOutput = (data) => this.send({ type: "terminal.output", payload: { terminalId, data } });
        terminal.onExit = (exitCode, signal) => {
          this.terminalSessions.delete(terminalId);
          this.send({ type: "terminal.exit", payload: { terminalId, exitCode, signal: signal ?? null } });
        };
        this.terminalSessions.set(terminalId, terminal);
        try {
          await terminal.start({ sessionId, projectRoot });
        } catch (err) {
          this.terminalSessions.delete(terminalId);
          throw err;
        }
        const snapshot = terminal.snapshot();
        return { ok: true, pid: snapshot.metadata.pid ?? null, shell: snapshot.metadata.shell ?? null, reused: false };
      }
      case "input": {
        const terminal = this.terminalSessions.get(terminalId);
        if (!terminal) return { ok: false, message: "Terminal is not running" };
        terminal.write(String(params["data"] ?? ""));
        return { ok: true };
      }
      case "resize": {
        const terminal = this.terminalSessions.get(terminalId);
        if (!terminal) return { ok: false, message: "Terminal is not running" };
        const cols = typeof params["cols"] === "number" ? params["cols"] : 120;
        const rows = typeof params["rows"] === "number" ? params["rows"] : 30;
        terminal.resize(cols, rows);
        return { ok: true };
      }
      case "stop": {
        const terminal = this.terminalSessions.get(terminalId);
        if (terminal) {
          this.terminalSessions.delete(terminalId);
          await terminal.stop({ reason: "remote terminal stopped" });
        }
        return { ok: true };
      }
      default:
        throw new Error(`Unsupported terminal op: ${op}`);
    }
  }

  // ── Filesystem operations (local disk) ────────────────────────────

  private roots(): BrowseEntry[] {
    const home = homedir();
    const roots: BrowseEntry[] = [];
    if (process.platform === "win32") {
      // Minimal: list C:\; a full drive scan isn't needed for Linux nodes.
      roots.push({ name: "C:", path: "C:\\", type: "dir" });
    } else {
      roots.push({ name: "/", path: "/", type: "dir" });
    }
    roots.push({ name: "Home", path: home, type: "dir" });
    return roots;
  }

  private async browse(dirPath: string): Promise<{ path: string; parent: string | null; entries: BrowseEntry[] }> {
    const target = dirPath === "~" ? homedir() : (dirPath || homedir());
    const resolved = resolve(target);
    const info = await fsStat(resolved);
    if (!info.isDirectory()) throw new Error("Path is not a directory");

    const raw = await readdir(resolved, { withFileTypes: true });
    const entries: BrowseEntry[] = [];
    for (const d of raw) {
      if (d.name.startsWith(".") || HIDDEN.has(d.name)) continue;
      if (d.isDirectory()) entries.push({ name: d.name, path: join(resolved, d.name), type: "dir" });
      else if (d.isFile()) entries.push({ name: d.name, path: join(resolved, d.name), type: "file" });
    }
    entries.sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)));
    return {
      path: resolved,
      parent: dirname(resolved) !== resolved ? dirname(resolved) : null,
      entries,
    };
  }

  private async fsOp(op: string, params: Record<string, unknown>): Promise<unknown> {
    switch (op) {
      case "stat": {
        const info = await fsStat(resolve(params["path"] as string));
        return { size: info.size, isDirectory: info.isDirectory(), modified: info.mtime.toISOString() };
      }
      case "read":
      case "git-file-read": {
        const content = await readFile(resolve(params["path"] as string), "utf-8");
        return { content, size: content.length };
      }
      case "write": {
        const filePath = resolve(params["path"] as string);
        const content = String(params["content"] ?? "");
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf-8");
        return { ok: true, size: content.length };
      }
      case "patch": {
        const filePath = resolve(params["path"] as string);
        const search = String(params["search"] ?? "");
        const replace = String(params["replace"] ?? "");
        if (!search) throw new Error("Missing search text");
        const content = await readFile(filePath, "utf-8");
        const index = content.indexOf(search);
        if (index === -1) return { matched: false };
        const next = content.slice(0, index) + replace + content.slice(index + search.length);
        await writeFile(filePath, next, "utf-8");
        return { matched: true };
      }
      case "list": {
        const entries = await readdir(resolve(params["path"] as string), { withFileTypes: true });
        return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
      }
      case "exists": {
        try { await access(resolve(params["path"] as string)); return true; } catch { return false; }
      }
      case "mkdir": {
        await mkdir(resolve(params["path"] as string), { recursive: true });
        return { ok: true };
      }
      case "readdir": {
        const dirPath = resolve(params["path"] as string);
        const raw = await readdir(dirPath, { withFileTypes: true });
        return raw.map((d) => ({ name: d.name, path: join(dirPath, d.name), type: d.isDirectory() ? "dir" : "file" }));
      }
      case "search-project": {
        return runPrimaryProjectSearch({
          root: resolve(params["path"] as string),
          query: String(params["query"] ?? ""),
          mode: params["mode"] === "content" ? "content" : "files",
          limit: normalizeProjectSearchLimit(params["limit"], 50),
          includeIgnoredFiles: params["includeIgnoredFiles"] === true,
        });
      }
      case "git": {
        const cwd = resolve(params["cwd"] as string);
        const args = params["args"];
        if (typeof args !== "string" || !args) throw new Error("Missing git args");
        const { stdout, stderr } = await execAsync(`git ${args}`, {
          cwd, timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        return { stdout, stderr };
      }
      case "gh": {
        const cwd = resolve(params["cwd"] as string);
        const args = params["args"];
        if (typeof args !== "string" || !args) throw new Error("Missing gh args");
        const { GH_TOKEN: _g, GITHUB_TOKEN: _gh, ...cleanEnv } = process.env;
        void _g; void _gh;
        const { stdout, stderr } = await execAsync(`gh ${args}`, {
          cwd, timeout: 60_000, maxBuffer: 10 * 1024 * 1024, env: cleanEnv,
        });
        return { stdout, stderr };
      }
      default:
        throw new Error(`Unsupported fs op: ${op}`);
    }
  }

  private async toolOp(
    tool: string,
    args: Record<string, unknown>,
    projectRoot?: string,
    backgroundId?: string,
  ): Promise<unknown> {
    switch (tool) {
      case "terminal.run":
      case "jait.terminal":
      case "execute":
        return this.runCommand(args, projectRoot, backgroundId);
      // Aliases: the simplified core tool names map to the same handlers as
      // their canonical dotted counterparts (see REMOTE_EXECUTABLE_TOOLS).
      case "read":
      case "file.read":
        return { ok: true, message: "File read", data: await this.fsOp("read", args) };
      case "edit":
      case "file.write":
        return { ok: true, message: "File written", data: await this.fsOp("write", args) };
      case "file.patch": {
        const result = await this.fsOp("patch", args) as { matched?: boolean };
        return result.matched
          ? { ok: true, message: "File patched", data: result }
          : { ok: false, message: `Search string not found in ${String(args["path"] ?? "file")}` };
      }
      case "file.list":
        return { ok: true, message: "Directory listed", data: await this.fsOp("readdir", args) };
      case "file.stat":
        return { ok: true, message: "File stat", data: await this.fsOp("stat", args) };
      case "image.view": {
        // Read a file (typically an image) and return base64 for the gateway.
        const filePath = resolve(String(args["path"] ?? ""));
        const content = await readFile(filePath);
        return {
          ok: true,
          message: `Read ${content.length} bytes from ${filePath}`,
          data: { path: filePath, base64: content.toString("base64"), size: content.length },
        };
      }
      case "search":
      case "file.search":
        return runPrimarySearchTool(args, projectRoot);
      case "os.query": {
        const os = await import("node:os");
        return {
          ok: true,
          message: "OS query",
          data: {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            uptime: os.uptime(),
            homedir: os.homedir(),
            tmpdir: os.tmpdir(),
          },
        };
      }
      default:
        throw new Error(`Unsupported tool on node: ${tool}`);
    }
  }

  private async runCommand(
    args: Record<string, unknown>,
    projectRoot?: string,
    backgroundId?: string,
  ): Promise<unknown> {
    const command = String(args["command"] ?? "");
    if (!command.trim()) throw new Error("Missing command");
    const timeout = Math.max(Number(args["timeout"]) || 30_000, 0);
    const cwd = resolve(String(args["cwd"] ?? args["projectRoot"] ?? projectRoot ?? process.cwd()));
    if (args["isBackground"] === true) {
      // Return as soon as the child is spawned, then push the result to the
      // gateway when it exits — the gateway correlates it by backgroundId and
      // wakes the waiting agent. Without an id (an older gateway) there is
      // nobody to report to, so say so rather than promising a notification.
      const child = exec(command, {
        cwd,
        maxBuffer: BACKGROUND_MAX_BUFFER_BYTES,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      if (backgroundId) {
        let out = "";
        const append = (chunk: unknown): void => {
          out += String(chunk);
          // Only the tail is ever reported; don't buffer a whole build log.
          if (out.length > BACKGROUND_MAX_OUTPUT_CHARS * 2) {
            out = out.slice(-BACKGROUND_MAX_OUTPUT_CHARS);
          }
        };
        child.stdout?.on("data", append);
        child.stderr?.on("data", append);

        let reported = false;
        const report = (exitCode: number | null): void => {
          if (reported) return;
          reported = true;
          let output = out.trim();
          if (output.length > BACKGROUND_MAX_OUTPUT_CHARS) {
            output = "…(truncated)\n" + output.slice(-BACKGROUND_MAX_OUTPUT_CHARS);
          }
          this.send({
            type: "tool.background-complete",
            payload: { backgroundId, exitCode, output: output || "(no output)" },
          });
        };
        child.on("close", (code) => report(code));
        child.on("error", (err) => {
          append(`\n${errMsg(err)}`);
          report(null);
        });
      }

      return {
        ok: true,
        message: backgroundId
          ? "Background command started on node. You'll be notified automatically when it finishes — "
            + "end your turn and wait rather than polling."
          : "Background command started on node, but this gateway did not supply a completion id — "
            + "you will NOT be notified when it finishes, so check on it yourself.",
        data: {
          output: backgroundId
            ? "(background — running on node; you'll be notified on completion)"
            : "(background — running on node; no completion notification will be sent)",
          exitCode: null,
          timedOut: false,
          watched: Boolean(backgroundId),
        },
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: timeout || undefined,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      const output = [stdout, stderr].filter(Boolean).join(stderr ? "\n" : "").trim() || "(no output)";
      return {
        ok: true,
        message: "Command completed (exit code 0)",
        data: { output, exitCode: 0, timedOut: false },
      };
    } catch (err: unknown) {
      const failure = err as { stdout?: string; stderr?: string; code?: number | null; killed?: boolean };
      const output = [failure.stdout, failure.stderr].filter(Boolean).join(failure.stderr ? "\n" : "").trim() || errMsg(err);
      return {
        ok: false,
        message: failure.killed
          ? `Command timed out after ${timeout}ms`
          : `Command failed (exit code ${failure.code ?? "unknown"})`,
        data: { output, exitCode: failure.code ?? null, timedOut: Boolean(failure.killed) },
      };
    }
  }


}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
