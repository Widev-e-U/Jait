import { createRequire } from "node:module";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import type { SecretInputService } from "../services/secret-input.js";
import { uuidv7 } from "../db/uuidv7.js";

const require = createRequire(import.meta.url);

interface SshRunInput {
  host: string;
  username: string;
  command: string;
  port?: number;
  timeoutMs?: number;
  authMethod?: "password" | "key";
  strictHostKeyChecking?: boolean;
}

interface SshSessionStartInput {
  host: string;
  username: string;
  port?: number;
  authMethod?: "password" | "key";
  strictHostKeyChecking?: boolean;
  timeoutMs?: number;
}

interface SshSessionRunInput {
  sshSessionId: string;
  command: string;
  timeoutMs?: number;
}

interface SshSessionCloseInput {
  sshSessionId: string;
}

interface PtyProcess {
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  kill(signal?: string): void;
}

export type SshPtyFactory = (command: string, args: string[], options: {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string | undefined>;
}) => PtyProcess;

interface PendingSshCommand {
  marker: string;
  command: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
  context?: ToolContext;
  resolve: (result: { output: string; exitCode: number | null; timedOut: boolean }) => void;
}

interface SshSession {
  id: string;
  host: string;
  username: string;
  port: number;
  pty: PtyProcess;
  buffer: string;
  createdAt: string;
  lastUsedAt: string;
  closed: boolean;
  passwordSent: boolean;
  pending: PendingSshCommand | null;
}

const sshSessions = new Map<string, SshSession>();

function loadNodePty(): SshPtyFactory {
  return (require("node-pty") as { spawn: SshPtyFactory }).spawn;
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

function cleanOutput(value: string, command: string): string {
  let output = stripAnsi(value).replace(/\r/g, "");
  output = output
    .split("\n")
    .filter((line) => line.trim() !== command.trim())
    .join("\n")
    .trim();
  if (output.length > 200_000) output = "…(truncated)\n" + output.slice(-200_000);
  return output || "(no output)";
}

function validateTargetPart(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required`;
  if (/[\s@'"]/u.test(value)) return `${label} cannot contain whitespace, quotes, or @`;
  return null;
}

function buildSshArgs(input: {
  host: string;
  username: string;
  port: number;
  password: string | null;
  strictHostKeyChecking: boolean;
  command?: string;
}): string[] {
  const args = [
    "-p", String(input.port),
    "-o", `StrictHostKeyChecking=${input.strictHostKeyChecking ? "yes" : "no"}`,
    "-o", "LogLevel=ERROR",
    "-o", "NumberOfPasswordPrompts=1",
    "-o", input.password ? "BatchMode=no" : "BatchMode=yes",
    `${input.username}@${input.host}`,
  ];
  if (!input.strictHostKeyChecking) {
    args.splice(4, 0, "-o", "UserKnownHostsFile=/dev/null");
  }
  if (input.password) {
    args.splice(0, 0, "-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "PubkeyAuthentication=no");
  }
  if (input.command) args.push(input.command);
  return args;
}

function spawnSshPty(args: string[], context: ToolContext, ptyFactory = loadNodePty()): PtyProcess {
  return ptyFactory("ssh", args, {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: context.workspaceRoot,
    env: {
      ...process.env,
      SSH_ASKPASS: undefined,
      DISPLAY: undefined,
    },
  });
}

function cleanSessionCommandOutput(value: string, command: string, marker: string): string {
  let output = stripAnsi(value).replace(/\r/g, "");
  const markerIndex = output.indexOf(marker);
  if (markerIndex >= 0) output = output.slice(0, markerIndex);
  const commandLines = command.trim().split("\n").map((line) => line.trim()).filter(Boolean);
  output = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (commandLines.includes(trimmed)) return false;
      if (trimmed.startsWith("printf ") && trimmed.includes(marker)) return false;
      return true;
    })
    .join("\n")
    .trim();
  if (output.length > 200_000) output = "…(truncated)\n" + output.slice(-200_000);
  return output || "(no output)";
}

function handleSessionData(session: SshSession, data: string): void {
  session.buffer += data;
  const pending = session.pending;
  if (!pending) return;

  const window = session.buffer.slice(pending.startedAt);
  const markerMatch = window.match(new RegExp(`${pending.marker}:(\\d+)`));
  if (!markerMatch) {
    const clean = stripAnsi(data).replace(/\r/g, "");
    if (clean && !/password.*:\s*$/im.test(clean)) pending.context?.onOutputChunk?.(clean);
    return;
  }

  clearTimeout(pending.timer);
  session.pending = null;
  session.lastUsedAt = new Date().toISOString();
  const exitCode = Number(markerMatch[1]);
  const output = cleanSessionCommandOutput(window.slice(0, markerMatch.index), pending.command, pending.marker);
  pending.resolve({ output, exitCode, timedOut: false });
}

function runCommandInSshSession(
  session: SshSession,
  command: string,
  timeoutMs: number,
  context?: ToolContext,
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
  if (session.closed) {
    return Promise.resolve({ output: "SSH session is closed", exitCode: null, timedOut: false });
  }
  if (session.pending) {
    return Promise.resolve({ output: "SSH session is already running a command", exitCode: null, timedOut: false });
  }

  return new Promise((resolve) => {
    const marker = `__JAIT_SSH_DONE_${uuidv7().replace(/-/g, "_")}__`;
    const startedAt = session.buffer.length;
    const timer = setTimeout(() => {
      if (session.pending?.marker !== marker) return;
      session.pending = null;
      resolve({
        output: cleanSessionCommandOutput(session.buffer.slice(startedAt), command, marker),
        exitCode: null,
        timedOut: true,
      });
    }, timeoutMs);
    session.pending = { marker, command, startedAt, timer, context, resolve };
    session.pty.write(`${command}\nprintf '\\n${marker}:%s\\n' "$?"\r`);
  });
}

async function getPasswordIfNeeded(
  secretInput: SecretInputService | undefined,
  input: { authMethod?: "password" | "key"; username: string; host: string; timeoutMs?: number },
  context: ToolContext,
  requestedBy: string,
): Promise<string | null | undefined> {
  const authMethod = input.authMethod ?? "password";
  if (authMethod === "key") return null;
  if (!secretInput) return undefined;
  return secretInput.requestSecret({
    sessionId: context.sessionId,
    userId: context.userId,
    title: "SSH password",
    prompt: `Password for ${input.username}@${input.host}`,
    requestedBy,
    timeoutMs: input.timeoutMs && input.timeoutMs > 120_000 ? input.timeoutMs : 120_000,
  });
}

function startSshSession(input: {
  host: string;
  username: string;
  port: number;
  password: string | null;
  timeoutMs: number;
  strictHostKeyChecking: boolean;
}, context: ToolContext, ptyFactory?: SshPtyFactory): Promise<SshSession> {
  return new Promise((resolve, reject) => {
    const id = `ssh-${uuidv7()}`;
    const args = buildSshArgs({
      host: input.host,
      username: input.username,
      port: input.port,
      password: input.password,
      strictHostKeyChecking: input.strictHostKeyChecking,
    });
    const pty = spawnSshPty(args, context, ptyFactory);
    const now = new Date().toISOString();
    const readyMarker = `__JAIT_SSH_READY_${uuidv7().replace(/-/g, "_")}__`;
    const session: SshSession = {
      id,
      host: input.host,
      username: input.username,
      port: input.port,
      pty,
      buffer: "",
      createdAt: now,
      lastUsedAt: now,
      closed: false,
      passwordSent: false,
      pending: null,
    };

    sshSessions.set(id, session);

    let settled = false;
    let readyProbeSent = false;
    const sendReadyProbe = () => {
      if (readyProbeSent || settled) return;
      readyProbeSent = true;
      pty.write(`printf '\\n${readyMarker}\\n'\r`);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { pty.kill("SIGTERM"); } catch {}
      sshSessions.delete(id);
      reject(new Error(`SSH session did not become ready within ${input.timeoutMs}ms`));
    }, input.timeoutMs);

    pty.onData((data) => {
      if (settled) {
        handleSessionData(session, data);
        return;
      }
      session.buffer += data;
      const visible = stripAnsi(session.buffer);
      if (input.password && !session.passwordSent && /(?:password|passphrase).*:\s*$/im.test(visible)) {
        session.passwordSent = true;
        pty.write(`${input.password}\r`);
        setTimeout(sendReadyProbe, 500);
        return;
      }
      if (!input.password) setTimeout(sendReadyProbe, 500);
      if (visible.includes(readyMarker) && !settled) {
        settled = true;
        clearTimeout(timer);
        session.buffer = "";
        resolve(session);
        return;
      }
    });

    pty.onExit(() => {
      session.closed = true;
      sshSessions.delete(id);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("SSH process exited before the session became ready"));
      }
    });
    if (!input.password) setTimeout(sendReadyProbe, 500);
  });
}

function runSshInPty(input: {
  host: string;
  username: string;
  command: string;
  port: number;
  password: string | null;
  timeoutMs: number;
  strictHostKeyChecking: boolean;
}, context: ToolContext, ptyFactory?: SshPtyFactory): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const args = buildSshArgs({
      host: input.host,
      username: input.username,
      port: input.port,
      password: input.password,
      strictHostKeyChecking: input.strictHostKeyChecking,
      command: input.command,
    });
    const pty = spawnSshPty(args, context, ptyFactory);

    let raw = "";
    let exitCode: number | null = null;
    let timedOut = false;
    let passwordSent = false;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ output: cleanOutput(raw, input.command), exitCode, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try { pty.kill("SIGTERM"); } catch {}
      setTimeout(finish, 300);
    }, input.timeoutMs);

    pty.onData((data) => {
      raw += data;
      const visible = stripAnsi(raw);
      if (input.password && !passwordSent && /(?:password|passphrase).*:\s*$/im.test(visible)) {
        passwordSent = true;
        pty.write(`${input.password}\r`);
      }
      const clean = stripAnsi(data).replace(/\r/g, "");
      if (clean && !/password.*:\s*$/im.test(clean)) context.onOutputChunk?.(clean);
    });

    pty.onExit((event) => {
      exitCode = typeof event.exitCode === "number" ? event.exitCode : null;
      finish();
    });

    context.signal?.addEventListener("abort", () => {
      try { pty.kill("SIGTERM"); } catch {}
      setTimeout(finish, 300);
    }, { once: true });
  });
}

export function createSshRunTool(secretInput?: SecretInputService, ptyFactory?: SshPtyFactory): ToolDefinition<SshRunInput> {
  return {
    name: "ssh.run",
    description:
      "Run a command on a remote Linux server over SSH. For password auth, the gateway asks the user for the password through a secret prompt that is never sent to the LLM or included in tool arguments.",
    tier: "standard",
    category: "network",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "always",
    parameters: {
      type: "object",
      properties: {
        host: { type: "string", description: "Remote host or IP address" },
        username: { type: "string", description: "Remote SSH username" },
        command: { type: "string", description: "Command to run on the remote host" },
        port: { type: "number", description: "SSH port, default 22" },
        timeoutMs: { type: "number", description: "Execution timeout in milliseconds, default 30000" },
        authMethod: { type: "string", enum: ["password", "key"], description: "Authentication method. Password uses a user-only secret prompt." },
        strictHostKeyChecking: { type: "boolean", description: "Whether OpenSSH should enforce known_hosts checking, default true" },
      },
      required: ["host", "username", "command"],
    },
    async execute(input, context): Promise<ToolResult> {
      const hostError = validateTargetPart(input.host, "host");
      const userError = validateTargetPart(input.username, "username");
      if (hostError || userError) return { ok: false, message: hostError ?? userError! };

      const authMethod = input.authMethod ?? "password";
      let password: string | null = null;
      if (authMethod === "password") {
        if (!secretInput) return { ok: false, message: "Secret input service is unavailable" };
        password = await secretInput.requestSecret({
          sessionId: context.sessionId,
          userId: context.userId,
          title: "SSH password",
          prompt: `Password for ${input.username}@${input.host}`,
          requestedBy: "ssh.run",
          timeoutMs: input.timeoutMs && input.timeoutMs > 120_000 ? input.timeoutMs : 120_000,
        });
        if (!password) return { ok: false, message: "SSH password was not provided" };
      }

      const result = await runSshInPty({
        host: input.host,
        username: input.username,
        command: input.command,
        port: input.port ?? 22,
        password,
        timeoutMs: input.timeoutMs ?? 30_000,
        strictHostKeyChecking: input.strictHostKeyChecking ?? true,
      }, context, ptyFactory);

      return {
        ok: !result.timedOut && result.exitCode === 0,
        message: result.timedOut
          ? `SSH command timed out after ${input.timeoutMs ?? 30_000}ms`
          : `SSH command exited with code ${result.exitCode ?? "unknown"}`,
        data: {
          output: result.output,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          host: input.host,
          username: input.username,
          port: input.port ?? 22,
        },
      };
    },
  };
}

export function createSshSessionStartTool(secretInput?: SecretInputService, ptyFactory?: SshPtyFactory): ToolDefinition<SshSessionStartInput> {
  return {
    name: "ssh.session.start",
    description:
      "Start a persistent SSH PTY session to a remote Linux server. Password authentication uses a user-only secret prompt; the password is never sent to the LLM or included in tool arguments.",
    tier: "standard",
    category: "network",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "always",
    parameters: {
      type: "object",
      properties: {
        host: { type: "string", description: "Remote host or IP address" },
        username: { type: "string", description: "Remote SSH username" },
        port: { type: "number", description: "SSH port, default 22" },
        authMethod: { type: "string", enum: ["password", "key"], description: "Authentication method. Password uses a user-only secret prompt." },
        strictHostKeyChecking: { type: "boolean", description: "Whether OpenSSH should enforce known_hosts checking, default true" },
        timeoutMs: { type: "number", description: "Startup timeout in milliseconds, default 30000" },
      },
      required: ["host", "username"],
    },
    async execute(input, context): Promise<ToolResult> {
      const hostError = validateTargetPart(input.host, "host");
      const userError = validateTargetPart(input.username, "username");
      if (hostError || userError) return { ok: false, message: hostError ?? userError! };

      const password = await getPasswordIfNeeded(secretInput, input, context, "ssh.session.start");
      if (password === undefined) return { ok: false, message: "Secret input service is unavailable" };
      if ((input.authMethod ?? "password") === "password" && !password) {
        return { ok: false, message: "SSH password was not provided" };
      }

      try {
        const session = await startSshSession({
          host: input.host,
          username: input.username,
          port: input.port ?? 22,
          password,
          timeoutMs: input.timeoutMs ?? 30_000,
          strictHostKeyChecking: input.strictHostKeyChecking ?? true,
        }, context, ptyFactory);
        return {
          ok: true,
          message: `SSH session started: ${session.id}`,
          data: {
            sshSessionId: session.id,
            host: session.host,
            username: session.username,
            port: session.port,
            createdAt: session.createdAt,
          },
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Failed to start SSH session",
        };
      }
    },
  };
}

export function createSshSessionRunTool(): ToolDefinition<SshSessionRunInput> {
  return {
    name: "ssh.session.run",
    description:
      "Run a command inside an existing persistent SSH PTY session created by ssh.session.start. Shell state such as cwd and environment is preserved between calls.",
    tier: "standard",
    category: "network",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "always",
    parameters: {
      type: "object",
      properties: {
        sshSessionId: { type: "string", description: "SSH session ID returned by ssh.session.start" },
        command: { type: "string", description: "Command to run in the remote SSH shell" },
        timeoutMs: { type: "number", description: "Execution timeout in milliseconds, default 30000" },
      },
      required: ["sshSessionId", "command"],
    },
    async execute(input, context): Promise<ToolResult> {
      const session = sshSessions.get(input.sshSessionId);
      if (!session || session.closed) return { ok: false, message: `SSH session not found: ${input.sshSessionId}` };
      const result = await runCommandInSshSession(session, input.command, input.timeoutMs ?? 30_000, context);
      return {
        ok: !result.timedOut && result.exitCode === 0,
        message: result.timedOut
          ? `SSH session command timed out after ${input.timeoutMs ?? 30_000}ms`
          : `SSH session command exited with code ${result.exitCode ?? "unknown"}`,
        data: {
          output: result.output,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          sshSessionId: session.id,
          host: session.host,
          username: session.username,
          port: session.port,
        },
      };
    },
  };
}

export function createSshSessionCloseTool(): ToolDefinition<SshSessionCloseInput> {
  return {
    name: "ssh.session.close",
    description: "Close a persistent SSH PTY session created by ssh.session.start.",
    tier: "standard",
    category: "network",
    source: "builtin",
    risk: "medium",
    defaultConsentLevel: "once",
    parameters: {
      type: "object",
      properties: {
        sshSessionId: { type: "string", description: "SSH session ID returned by ssh.session.start" },
      },
      required: ["sshSessionId"],
    },
    async execute(input): Promise<ToolResult> {
      const session = sshSessions.get(input.sshSessionId);
      if (!session) return { ok: false, message: `SSH session not found: ${input.sshSessionId}` };
      session.closed = true;
      sshSessions.delete(input.sshSessionId);
      try { session.pty.write("exit\r"); } catch {}
      setTimeout(() => {
        try { session.pty.kill("SIGTERM"); } catch {}
      }, 500);
      return {
        ok: true,
        message: `SSH session closed: ${input.sshSessionId}`,
        data: { sshSessionId: input.sshSessionId },
      };
    },
  };
}
