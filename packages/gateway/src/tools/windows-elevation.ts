import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import type { ToolContext } from "./contracts.js";

/**
 * Windows elevation for terminal.run { elevated: true }.
 *
 * A persistent PTY shell cannot be elevated in place, so Windows runs go
 * through a one-shot PowerShell wrapper: native UAC (Start-Process -Verb RunAs)
 * when no username is given, or credential-based Start-Process otherwise.
 * POSIX elevation does not use this module; it runs `sudo` inside the PTY.
 */

interface SpawnedProcessLike {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

export type ElevatedSpawnFactory = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => SpawnedProcessLike;

export interface WindowsElevatedResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
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

function buildWindowsCredentialWrapperScript(): string {
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

/**
 * Builds a PowerShell script that uses Start-Process -Verb RunAs to trigger
 * the native Windows UAC dialog for elevation, without requiring explicit
 * credentials.  Output is captured via temp files since -Verb RunAs cannot
 * use -RedirectStandardOutput/-RedirectStandardError directly.
 */
function buildWindowsUacWrapperScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$id = [guid]::NewGuid().ToString()",
    "$base = Join-Path $env:TEMP \"jait-uac-$id\"",
    "$stdoutPath = \"${base}-out.txt\"",
    "$stderrPath = \"${base}-err.txt\"",
    "$exitCodePath = \"${base}-ec.txt\"",
    "$cmdPath = \"${base}-cmd.txt\"",
    "$scriptPath = \"${base}.ps1\"",
    "",
    "# Write the command to a file (passed base64-encoded to avoid quoting issues)",
    "[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JAIT_ELEVATED_COMMAND_B64)) | Set-Content -Path $cmdPath -Encoding UTF8 -NoNewline",
    "",
    "# Build the inner elevated script that reads the command from file",
    "$cwd = $env:JAIT_ELEVATED_CWD -replace \"'\", \"''\"",
    "$lines = @(",
    "  \"`$ErrorActionPreference = 'Continue'\"",
    "  \"Set-Location -LiteralPath '\" + $cwd + \"'\"",
    "  \"`$cmd = Get-Content -Path '\" + ($cmdPath -replace \"'\", \"''\") + \"' -Raw\"",
    "  'try {'",
    "  \"  `$output = Invoke-Expression `$cmd 2>'\" + ($stderrPath -replace \"'\", \"''\") + \"'\"",
    "  \"  `$output | Out-File -FilePath '\" + ($stdoutPath -replace \"'\", \"''\") + \"' -Encoding utf8\"",
    "  \"  if (`$null -eq `$LASTEXITCODE) { 0 } else { `$LASTEXITCODE } | Out-File -FilePath '\" + ($exitCodePath -replace \"'\", \"''\") + \"' -Encoding utf8\"",
    "  '} catch {'",
    "  \"  `$_.Exception.Message | Out-File -FilePath '\" + ($stderrPath -replace \"'\", \"''\") + \"' -Encoding utf8 -Append\"",
    "  \"  1 | Out-File -FilePath '\" + ($exitCodePath -replace \"'\", \"''\") + \"' -Encoding utf8\"",
    "  '}'",
    ")",
    "$lines | Set-Content -Path $scriptPath -Encoding UTF8",
    "",
    "try {",
    "  $proc = Start-Process -Verb RunAs -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath) -Wait -PassThru -WindowStyle Hidden",
    "  $stdout = if (Test-Path $stdoutPath) { Get-Content -Raw $stdoutPath } else { '' }",
    "  $stderr = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { '' }",
    "  $ec = if (Test-Path $exitCodePath) { (Get-Content -Raw $exitCodePath).Trim() -as [int] } else { $null }",
    "  if ($null -eq $ec) { $ec = $proc.ExitCode }",
    "  [pscustomobject]@{ exitCode = $ec; stdout = $stdout; stderr = $stderr } | ConvertTo-Json -Compress",
    "} finally {",
    "  Remove-Item -Path \"${base}*\" -Force -ErrorAction SilentlyContinue",
    "}",
  ].join("\n");
}

function buildWindowsSpawn(input: {
  command: string;
  cwd: string;
  username?: string;
  password?: string | null;
}): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const useUac = !input.username;
  const script = useUac ? buildWindowsUacWrapperScript() : buildWindowsCredentialWrapperScript();
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    env: useUac
      ? {
        ...process.env,
        JAIT_ELEVATED_COMMAND_B64: Buffer.from(input.command, "utf8").toString("base64"),
        JAIT_ELEVATED_CWD: input.cwd,
      }
      : {
        ...process.env,
        JAIT_ELEVATED_COMMAND: input.command,
        JAIT_ELEVATED_CWD: input.cwd,
        JAIT_ELEVATED_USERNAME: input.username,
        JAIT_ELEVATED_PASSWORD: input.password ?? "",
      },
  };
}

/**
 * Runs `command` elevated on Windows and returns the unwrapped result. With no
 * `username` the native UAC dialog is shown; otherwise `password` is used for
 * credential-based elevation.
 */
export async function runWindowsElevatedCommand(
  input: {
    command: string;
    cwd: string;
    timeoutMs: number;
    username?: string;
    password?: string | null;
  },
  context: ToolContext,
  spawnFactory: ElevatedSpawnFactory = defaultSpawnFactory,
): Promise<WindowsElevatedResult> {
  const raw = await new Promise<WindowsElevatedResult>((resolve) => {
    const spawnSpec = buildWindowsSpawn(input);
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
  });

  // The wrapper prints a single JSON object; fall back to raw output if it doesn't parse.
  let stdout = raw.stdout.trim();
  let stderr = raw.stderr.trim();
  let exitCode = raw.exitCode;
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout) as { stdout?: string; stderr?: string; exitCode?: number };
      stdout = typeof parsed.stdout === "string" ? parsed.stdout.trim() : stdout;
      stderr = typeof parsed.stderr === "string" ? parsed.stderr.trim() : stderr;
      exitCode = typeof parsed.exitCode === "number" ? parsed.exitCode : exitCode;
    } catch {
      // Keep raw wrapper output if JSON parsing fails.
    }
  }
  return { stdout, stderr, exitCode, signal: raw.signal, timedOut: raw.timedOut };
}
