import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  message: string;
  fix?: string;
}

export interface DoctorDiagnosticCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  summary: string;
  details?: string[];
}

export interface DoctorDiagnosticReport {
  checks: DoctorDiagnosticCheck[];
  ok: boolean;
  counts: {
    pass: number;
    warn: number;
    fail: number;
  };
}

export interface DoctorResult {
  checks: DoctorCheck[];
  ok: boolean;
  warningCount: number;
  failureCount: number;
}

export interface RunDoctorOptions {
  cwd?: string;
  envPath?: string;
  port?: number | string;
  jaitDir?: string;
  minNodeVersion?: string;
  healthCheck?: (port: number) => Promise<unknown>;
  env?: NodeJS.ProcessEnv;
}

const require = createRequire(import.meta.url);

const PROVIDER_COMMANDS = [
  { id: "codex", command: "codex" },
  { id: "claude-code", command: "claude" },
  { id: "gemini", command: "gemini" },
  { id: "opencode", command: "opencode" },
  { id: "copilot", command: "copilot" },
] as const;

export function resolveDoctorEnvCandidates(options: Pick<RunDoctorOptions, "cwd" | "envPath" | "jaitDir">): string[] {
  const cwd = options.cwd ?? process.cwd();
  const jaitDir = options.jaitDir ?? join(homedir(), ".jait");
  return [options.envPath, resolve(cwd, ".env"), join(jaitDir, ".env")].filter((value): value is string => Boolean(value));
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < len; i++) {
    const a = leftParts[i] ?? 0;
    const b = rightParts[i] ?? 0;
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
}

function commandExists(command: string): boolean {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    execFileSync(probe, [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function detectPlaywright(): boolean {
  try {
    require.resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const jaitDir = options.jaitDir ?? join(homedir(), ".jait");
  const envCandidates = resolveDoctorEnvCandidates(options);
  const resolvedEnv = envCandidates.find((candidate) => existsSync(candidate));
  const dbPath = join(jaitDir, "data", "jait.db");
  const minNodeVersion = options.minNodeVersion ?? "22.5.0";
  const port = Number.parseInt(String(options.port ?? process.env["PORT"] ?? "8000"), 10);

  checks.push(
    resolvedEnv
      ? {
          id: "env-file",
          label: "Environment file",
          status: "pass",
          message: `Loaded from ${resolvedEnv}`,
        }
      : {
          id: "env-file",
          label: "Environment file",
          status: options.envPath ? "fail" : "warn",
          message: options.envPath
            ? `Configured env file was not found: ${options.envPath}`
            : "No .env file found in the current project or ~/.jait",
          fix: options.envPath
            ? "Create the specified env file or point --env at the correct location."
            : "Create .env in the project root or ~/.jait/.env.",
        },
  );

  checks.push(
    existsSync(jaitDir)
      ? {
          id: "jait-dir",
          label: "Jait home",
          status: "pass",
          message: `Found ${jaitDir}`,
        }
      : {
          id: "jait-dir",
          label: "Jait home",
          status: "warn",
          message: `${jaitDir} does not exist yet`,
          fix: "Start Jait once to initialize ~/.jait.",
        },
  );

  checks.push(
    existsSync(dbPath)
      ? {
          id: "database",
          label: "Gateway database",
          status: "pass",
          message: `Found ${dbPath}`,
        }
      : {
          id: "database",
          label: "Gateway database",
          status: "warn",
          message: `Database not found at ${dbPath}`,
          fix: "Start the gateway once so it creates ~/.jait/data/jait.db.",
        },
  );

  checks.push(
    compareSemver(process.version, minNodeVersion) >= 0
      ? {
          id: "node-version",
          label: "Node.js version",
          status: "pass",
          message: `${process.version} satisfies >= ${minNodeVersion}`,
        }
      : {
          id: "node-version",
          label: "Node.js version",
          status: "fail",
          message: `${process.version} is below the required >= ${minNodeVersion}`,
          fix: `Upgrade Node.js to ${minNodeVersion} or newer.`,
        },
  );

  checks.push(
    commandExists("bun")
      ? {
          id: "bun",
          label: "Bun runtime",
          status: "pass",
          message: "bun is available on PATH",
        }
      : {
          id: "bun",
          label: "Bun runtime",
          status: "warn",
          message: "bun is not available on PATH",
          fix: "Install Bun if you plan to run the monorepo dev workflow locally.",
        },
  );

  checks.push(
    detectPlaywright()
      ? {
          id: "playwright",
          label: "Playwright package",
          status: "pass",
          message: "playwright dependency is resolvable",
        }
      : {
          id: "playwright",
          label: "Playwright package",
          status: "warn",
          message: "playwright dependency is not resolvable",
          fix: "Run the workspace install so browser tooling is available.",
        },
  );

  for (const provider of PROVIDER_COMMANDS) {
    checks.push(
      commandExists(provider.command)
        ? {
            id: `provider-${provider.id}`,
            label: `${provider.id} CLI`,
            status: "pass",
            message: `${provider.command} is available on PATH`,
          }
        : {
            id: `provider-${provider.id}`,
            label: `${provider.id} CLI`,
            status: "warn",
            message: `${provider.command} is not available on PATH`,
            fix: `Install and configure ${provider.id} if you want to use that provider.`,
          },
    );
  }

  if (Number.isFinite(port) && port > 0 && options.healthCheck) {
    const health = await options.healthCheck(port);
    checks.push(
      health
        ? {
            id: "gateway-health",
            label: "Gateway health",
            status: "pass",
            message: `Gateway responded on http://127.0.0.1:${port}/health`,
          }
        : {
            id: "gateway-health",
            label: "Gateway health",
            status: "warn",
            message: `No gateway responded on http://127.0.0.1:${port}/health`,
            fix: "Run `jait start` or check the configured port.",
          },
    );
  } else {
    checks.push({
      id: "gateway-health",
      label: "Gateway health",
      status: "fail",
      message: `Invalid port: ${String(options.port ?? process.env["PORT"] ?? "8000")}`,
      fix: "Pass a numeric --port value.",
    });
  }

  const failureCount = checks.filter((check) => check.status === "fail").length;
  const warningCount = checks.filter((check) => check.status === "warn").length;

  return {
    checks,
    ok: failureCount === 0,
    failureCount,
    warningCount,
  };
}

export async function runDoctorDiagnostics(options: RunDoctorOptions = {}): Promise<DoctorDiagnosticReport> {
  if (options.env) {
    Object.assign(process.env, options.env);
  }

  const result = await runDoctor(options);
  return {
    checks: result.checks.map((check) => ({
      id: check.id,
      label: check.label,
      status: check.status,
      summary: check.message,
      details: check.fix ? [check.fix] : [],
    })),
    ok: result.ok,
    counts: {
      pass: result.checks.filter((check) => check.status === "pass").length,
      warn: result.warningCount,
      fail: result.failureCount,
    },
  };
}
