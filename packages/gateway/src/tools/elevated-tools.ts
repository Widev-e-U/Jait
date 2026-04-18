import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { platform } from "node:os";
import type { SecretInputService } from "../services/secret-input.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

interface ElevatedRunInput {
  command: string;
  username?: string;
  cwd?: string;
  timeoutMs?: number;
  reason?: string;
}

interface SpawnedProcessLike {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  stdin?: { write(chunk: string): void } | null;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

export type ElevatedSpawnFactory = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => SpawnedProcessLike;

interface ElevatedToolRuntime {
  platform?: () => NodeJS.Platform;
  getuid?: () => number | undefined;
}

function defaultSpawnFactory(
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
): SpawnedProcessLike {
  return spawn(command, args, options);
}

function truncateOutput(value: string): string {
  if (value.length > 200_000) return `...(truncated)\n${value.slice(-200_000)}`;
  return value;
}

function sanitizeStreamChunk(chunk: string): string {
  return chunk.replace(/\r\n/g, "\n").replace(/\r/g, "");
}

function buildWindowsWrapperScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$password = ConvertTo-SecureString $env:JAIT_ELEVATED_PASSWORD -AsPlainText -Force",
    "$credential = New-Object System.Management.Automation.PSCredential($env:JAIT_ELEVATED_USERNAME, $password)",
    "$stdoutPath = Join-Path $env:TEMP ('jait-elevated-out-' + [guid]::NewGuid().ToString() + '.txt')",
    "$stderrPath = Join-Path $env:TEMP ('jait-elevated-err-' + [guid]::NewGuid().ToString() + '.txt')",
    "try {",
    "  $proc = Start-Process -FilePath 'powershell.exe' -Credential $credential -WorkingDirectory $env:JAIT_ELEVATED_CWD -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', $env:JAIT_ELEVATED_COMMAND) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath",
    "  $stdout = if (Test-Path $stdoutPath) { Get-Content -Raw $stdoutPath } else { '' }",
    "  $stderr = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { '' }",
    "  [pscustomobject]@{ exitCode = $proc.ExitCode; stdout = $stdout; stderr = $stderr } | ConvertTo-Json -Compress",
    "} finally {",
    "  if (Test-Path $stdoutPath) { Remove-Item $stdoutPath -Force -ErrorAction SilentlyContinue }",
    "  if (Test-Path $stderrPath) { Remove-Item $stderrPath -Force -ErrorAction SilentlyContinue }",
    "}",
  ].join("\n");
}

function buildWindowsSpawn(
  input: {
    command: string;
    cwd: string;
    username: string;
    password: string;
  },
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const script = buildWindowsWrapperScript();
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    env: {
      ...process.env,
      JAIT_ELEVATED_COMMAND: input.command,
      JAIT_ELEVATED_CWD: input.cwd,
      JAIT_ELEVATED_USERNAME: input.username,
      JAIT_ELEVATED_PASSWORD: input.password,
    },
  };
}

async function runElevatedCommand(
  input: {
    command: string;
    cwd: string;
    timeoutMs: number;
    username?: string;
    password: string | null;
    isElevatedAlready: boolean;
    platform: NodeJS.Platform;
  },
  context: ToolContext,
  spawnFactory: ElevatedSpawnFactory,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
 }> {
  return new Promise((resolve) => {
    const windows = input.platform === "win32";
    const spawnSpec = windows
      ? buildWindowsSpawn({
        command: input.command,
        cwd: input.cwd,
        username: input.username!,
        password: input.password!,
      })
      : {
        command: input.isElevatedAlready ? "sh" : "sudo",
        args: input.isElevatedAlready
          ? ["-lc", input.command]
          : ["-S", "-k", "-p", "", "--", "sh", "-lc", input.command],
        env: {
          ...process.env,
          SUDO_ASKPASS: undefined,
        },
      };
    const child = spawnFactory(spawnSpec.command, spawnSpec.args, {
      cwd: input.cwd,
      env: spawnSpec.env,
      stdio: "pipe",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let signal: NodeJS.Signals | null = null;
    let timedOut = false;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", onAbort);
      resolve({
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        exitCode,
        signal,
        timedOut,
      });
    };

    const terminate = () => {
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
      }, 500);
    };

    const onAbort = () => {
      timedOut = true;
      terminate();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, input.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      const text = sanitizeStreamChunk(String(chunk));
      stdout += text;
      if (text) context.onOutputChunk?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = sanitizeStreamChunk(String(chunk));
      stderr += text;
      if (text) context.onOutputChunk?.(text);
    });
    child.on("error", (error) => {
      stderr += `${error.message}\n`;
    });
    child.on("close", (code, closeSignal) => {
      exitCode = code;
      signal = closeSignal;
      finish();
    });
    context.signal?.addEventListener("abort", onAbort, { once: true });

    if (!windows && input.password) {
      child.stdin?.write(`${input.password}\n`);
    }
  });
}

export function createElevatedRunTool(
  secretInput?: SecretInputService,
  spawnFactory: ElevatedSpawnFactory = defaultSpawnFactory,
  runtime: ElevatedToolRuntime = {},
): ToolDefinition<ElevatedRunInput> {
  return {
    name: "elevated.run",
    description:
      "Run a local command with elevated privileges. On Linux and macOS, this uses sudo. On Windows, this runs PowerShell under an explicitly provided administrator account. Passwords are requested through a secret prompt and are never sent to the LLM or included in tool arguments.",
    tier: "standard",
    category: "os",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "always",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run with elevated privileges" },
        username: { type: "string", description: "Windows only: administrator account username to run the command under" },
        cwd: { type: "string", description: "Working directory for the command. Defaults to the workspace root." },
        timeoutMs: { type: "number", description: "Execution timeout in milliseconds, default 30000" },
        reason: { type: "string", description: "Short human-readable reason shown in the password prompt context." },
      },
      required: ["command"],
    },
    async execute(input, context): Promise<ToolResult> {
      const shellCommand = input.command?.trim();
      if (!shellCommand) return { ok: false, message: "command is required" };

      const currentPlatform = runtime.platform?.() ?? platform();
      const currentUid = runtime.getuid?.() ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
      const isElevatedAlready = currentPlatform !== "win32" && currentUid === 0;
      const windowsUsername = input.username?.trim();
      if (currentPlatform === "win32" && !windowsUsername) {
        return { ok: false, message: "On Windows, elevated.run requires `username` for an administrator account" };
      }
      let password: string | null = null;
      if (!isElevatedAlready) {
        if (!secretInput) return { ok: false, message: "Secret input service is unavailable" };
        password = await secretInput.requestSecret({
          sessionId: context.sessionId,
          userId: context.userId,
          title: "Administrator password",
          prompt: currentPlatform === "win32"
            ? (input.reason?.trim()
              ? `Password for ${windowsUsername} to run an elevated command: ${input.reason.trim()}`
              : `Password for ${windowsUsername} to run an elevated command`)
            : (input.reason?.trim()
              ? `Password to run an elevated command: ${input.reason.trim()}`
              : "Password to run an elevated command with sudo"),
          requestedBy: "elevated.run",
          timeoutMs: input.timeoutMs && input.timeoutMs > 120_000 ? input.timeoutMs : 120_000,
        });
        if (!password) return { ok: false, message: "Administrator password was not provided" };
      }

      const result = await runElevatedCommand({
        command: shellCommand,
        cwd: input.cwd ?? context.workspaceRoot,
        timeoutMs: input.timeoutMs ?? 30_000,
        username: windowsUsername,
        password,
        isElevatedAlready,
        platform: currentPlatform,
      }, context, spawnFactory);

      let stdout = result.stdout.trim();
      let stderr = result.stderr.trim();
      let exitCode = result.exitCode;
      if (currentPlatform === "win32" && stdout) {
        try {
          const parsed = JSON.parse(stdout) as { stdout?: string; stderr?: string; exitCode?: number };
          stdout = typeof parsed.stdout === "string" ? parsed.stdout.trim() : stdout;
          stderr = typeof parsed.stderr === "string" ? parsed.stderr.trim() : stderr;
          exitCode = typeof parsed.exitCode === "number" ? parsed.exitCode : exitCode;
        } catch {
          // Keep raw wrapper output if JSON parsing fails.
        }
      }
      const combinedOutput = [stdout, stderr].filter(Boolean).join("\n");
      return {
        ok: !result.timedOut && exitCode === 0,
        message: result.timedOut
          ? `Elevated command timed out after ${input.timeoutMs ?? 30_000}ms`
          : `Elevated command exited with code ${exitCode ?? "unknown"}`,
        data: {
          output: combinedOutput || "(no output)",
          stdout,
          stderr,
          exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          cwd: input.cwd ?? context.workspaceRoot,
          elevated: !isElevatedAlready,
        },
      };
    },
  };
}
