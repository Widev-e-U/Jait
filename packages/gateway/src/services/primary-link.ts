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
import { join, resolve, dirname, relative } from "node:path";
import { homedir, hostname, platform } from "node:os";
import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { NODE_PROTOCOL_VERSION } from "@jait/shared";

const execAsync = promisify(exec);

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

const NODE_TOOLS = [
  "terminal.run",
  "jait.terminal",
  "execute",
  "file.read",
  "file.write",
  "file.patch",
  "file.list",
  "file.stat",
  "file.search",
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

export class PrimaryLink {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly nodeId = getNodeId();

  constructor(private readonly opts: PrimaryLinkOptions) {}

  start(): void {
    if (this.stopped) return;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
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
        try {
          const result = await this.toolOp(tool, args, projectRoot);
          this.send({ type: "tool.op-response", payload: { requestId, result } });
        } catch (err) {
          this.send({ type: "tool.op-response", payload: { requestId, error: errMsg(err) } });
        }
        break;
      }
      default:
        // Provider requests are not served here; the headless node exposes
        // filesystem and terminal/tool execution to the primary gateway.
        break;
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
        return this.searchProject(
          resolve(params["path"] as string),
          String(params["query"] ?? ""),
          params["mode"] === "content" ? "content" : "files",
          Math.min(Math.max(Number(params["limit"]) || 50, 1), 200),
        );
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

  private async toolOp(tool: string, args: Record<string, unknown>, projectRoot?: string): Promise<unknown> {
    switch (tool) {
      case "terminal.run":
      case "jait.terminal":
      case "execute":
        return this.runCommand(args, projectRoot);
      case "file.read":
        return { ok: true, message: "File read", data: await this.fsOp("read", args) };
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
      case "file.search":
        return {
          ok: true,
          message: "Search completed",
          data: await this.searchProject(
            resolve(String(args["path"] ?? projectRoot ?? homedir())),
            String(args["query"] ?? ""),
            args["mode"] === "content" ? "content" : "files",
            Math.min(Math.max(Number(args["limit"]) || 50, 1), 200),
          ),
        };
      default:
        throw new Error(`Unsupported tool on node: ${tool}`);
    }
  }

  private async runCommand(args: Record<string, unknown>, projectRoot?: string): Promise<unknown> {
    const command = String(args["command"] ?? "");
    if (!command.trim()) throw new Error("Missing command");
    const timeout = Math.max(Number(args["timeout"]) || 30_000, 0);
    const cwd = resolve(String(args["cwd"] ?? args["projectRoot"] ?? projectRoot ?? process.cwd()));
    if (args["isBackground"] === true) {
      exec(command, {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      return {
        ok: true,
        message: "Background command started on node",
        data: { output: "(background — not waiting for output)", exitCode: null, timedOut: false },
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

  private async searchProject(
    projectRoot: string,
    query: string,
    mode: "files" | "content",
    maxResults: number,
  ): Promise<unknown> {
    const safeDir = projectRoot.replace(/"/g, '\\"');
    const safeQuery = query.replace(/"/g, '\\"');
    try {
      if (mode === "content") {
        const cmd = `rg --no-heading --line-number --max-count ${maxResults} --ignore-case --fixed-strings -- "${safeQuery}" "${safeDir}" 2>/dev/null`
          + ` || grep -rn -i -F --max-count=${maxResults} -- "${safeQuery}" "${safeDir}" 2>/dev/null`;
        const { stdout } = await execAsync(cmd, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
        const matches = stdout.trim().split("\n").filter(Boolean).slice(0, maxResults).map((line) => {
          const m = line.match(/^(.+?):(\d+):(.*)$/);
          if (!m) return null;
          return { file: relative(projectRoot, m[1]!).replace(/\\/g, "/"), line: parseInt(m[2]!, 10), content: m[3]!.trim() };
        }).filter(Boolean);
        return { query, mode, matches };
      }
      const cleaned = query.replace(/[*?[\]]/g, "").trim();
      if (!cleaned) return { query, mode, files: [] };
      const safeFileQuery = cleaned.replace(/"/g, '\\"');
      const cmd = `rg --files "${safeDir}" 2>/dev/null | grep -iF -- "${safeFileQuery}" | head -n ${maxResults}`;
      const { stdout } = await execAsync(cmd, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
      const files = stdout.trim().split("\n").filter(Boolean).slice(0, maxResults).map((absPath) => {
        const relPath = relative(projectRoot, absPath.trim()).replace(/\\/g, "/");
        return { path: relPath, name: relPath.split("/").pop() || relPath };
      });
      return { query, mode, files };
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string })?.stderr || "";
      if (stderr && !stderr.includes("No such file")) throw new Error(stderr.slice(0, 200));
      return mode === "content" ? { query, mode, matches: [] } : { query, mode, files: [] };
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
