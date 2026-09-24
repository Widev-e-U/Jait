import { execFile } from "node:child_process";
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { ProviderUpdateInfo, ProviderUpdateResult } from "@jait/shared";

const execFileAsync = promisify(execFile);

const CHECK_INTERVAL_MS = 6 * 60 * 60_000;
const CHECK_TIMEOUT_MS = 15_000;
const UPDATE_TIMEOUT_MS = 5 * 60_000;

interface ProviderUpdateSpec {
  command: string;
  packageName: string;
}

const UPDATE_SPECS: Record<string, ProviderUpdateSpec> = {
  codex: { command: "codex", packageName: "@openai/codex" },
  "claude-code": { command: "claude", packageName: "@anthropic-ai/claude-code" },
};

type ExecFileLike = (
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

export interface ProviderUpdateServiceOptions {
  execFile?: ExecFileLike;
  resolveCommandPath?: (command: string) => string | null;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  now?: () => Date;
}

export function resolveCommandPath(command: string): string | null {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const path = join(directory, `${command}${extension}`);
      try {
        accessSync(path, constants.X_OK);
        return realpathSync(path);
      } catch { /* try the next PATH entry */ }
    }
  }
  return null;
}

export function isNativeClaudeInstall(path: string | null): boolean {
  if (!path) return false;
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return normalized.includes("/.local/share/claude/") || normalized.includes("/.claude/local/");
}

function parseVersion(value: string): string | null {
  return value.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1] ?? null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = (left.split("-", 2)[0] ?? left).split(".").map(Number);
  const rightParts = (right.split("-", 2)[0] ?? right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export class ProviderUpdateService {
  private readonly statuses = new Map<string, ProviderUpdateInfo>();
  private readonly inflight = new Map<string, Promise<ProviderUpdateInfo | null>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly run: ExecFileLike;
  private readonly fetchImpl: typeof fetch;
  private readonly intervalMs: number;
  private readonly now: () => Date;
  private readonly resolvePath: (command: string) => string | null;

  constructor(options: ProviderUpdateServiceOptions = {}) {
    this.run = options.execFile ?? (execFileAsync as ExecFileLike);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.intervalMs = options.intervalMs ?? CHECK_INTERVAL_MS;
    this.now = options.now ?? (() => new Date());
    this.resolvePath = options.resolveCommandPath ?? resolveCommandPath;
  }

  start(): void {
    if (this.timer) return;
    void this.refreshAll();
    this.timer = setInterval(() => void this.refreshAll(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  supports(providerType: string): boolean {
    return Boolean(UPDATE_SPECS[providerType]);
  }

  async getStatus(providerType: string, force = false): Promise<ProviderUpdateInfo | null> {
    if (!this.supports(providerType)) return null;
    if (!force) {
      const cached = this.statuses.get(providerType);
      if (cached && this.now().getTime() - new Date(cached.checkedAt).getTime() < this.intervalMs) return cached;
      const existing = this.inflight.get(providerType);
      if (existing) return existing;
    }

    const request = this.check(providerType).finally(() => this.inflight.delete(providerType));
    this.inflight.set(providerType, request);
    return request;
  }

  async update(providerType: string): Promise<ProviderUpdateResult> {
    const spec = UPDATE_SPECS[providerType];
    if (!spec) throw new Error(`Updates are not supported for provider ${providerType}`);

    const nativeClaude = providerType === "claude-code" && isNativeClaudeInstall(this.resolvePath(spec.command));
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const command = nativeClaude ? spec.command : npmCommand;
    const args = nativeClaude ? ["update"] : ["install", "--global", `${spec.packageName}@latest`];
    try {
      await this.run(command, args, { timeout: UPDATE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
    } catch (error) {
      const detail = error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim() : "";
      throw new Error(detail || (error instanceof Error ? error.message : `Failed to update ${providerType}`));
    }
    this.statuses.delete(providerType);
    const status = await this.getStatus(providerType, true);
    if (!status) throw new Error(`Unable to verify the ${providerType} update`);
    if (status.updateAvailable) {
      throw new Error(`The ${providerType} update finished, but ${spec.command} still resolves to ${status.currentVersion}. Check the active executable on PATH.`);
    }
    return { ...status, ok: true, message: `${providerType} updated to ${status.currentVersion}.` };
  }

  private async refreshAll(): Promise<void> {
    await Promise.all(Object.keys(UPDATE_SPECS).map((providerType) => this.getStatus(providerType, true).catch(() => null)));
  }

  private async check(providerType: string): Promise<ProviderUpdateInfo> {
    const spec = UPDATE_SPECS[providerType];
    if (!spec) throw new Error(`Updates are not supported for provider ${providerType}`);
    const [{ stdout, stderr }, response] = await Promise.all([
      this.run(spec.command, ["--version"], { timeout: CHECK_TIMEOUT_MS, maxBuffer: 1024 * 1024 }),
      this.fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(spec.packageName)}/latest`, {
        headers: { Accept: "application/json", "User-Agent": "Jait provider update checker" },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      }),
    ]);
    if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
    const currentVersion = parseVersion(`${stdout}\n${stderr}`);
    const body = await response.json() as { version?: unknown };
    const latestVersion = typeof body.version === "string" ? parseVersion(body.version) : null;
    if (!currentVersion) throw new Error(`Could not read the installed ${providerType} version`);
    if (!latestVersion) throw new Error(`Could not read the latest ${providerType} version`);
    const status: ProviderUpdateInfo = {
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(currentVersion, latestVersion) < 0,
      checkedAt: this.now().toISOString(),
    };
    this.statuses.set(providerType, status);
    return status;
  }
}
