import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { extractDeviceAuthDetails as extractSharedDeviceAuthDetails } from "@jait/shared";
import type {
  ProviderAuthCapabilities,
  ProviderId,
  ProviderLoginResult,
  ProviderLogoutResult,
} from "./contracts.js";

export const NO_PROVIDER_AUTH: ProviderAuthCapabilities = {
  login: false,
  logout: false,
  deviceCode: false,
};

export const DEVICE_PROVIDER_AUTH: ProviderAuthCapabilities = {
  login: true,
  logout: true,
  deviceCode: true,
};

export function unsupportedLogin(providerId: ProviderId, message: string): ProviderLoginResult {
  return { ok: false, status: "unsupported", providerId, message };
}

export function unsupportedLogout(providerId: ProviderId, message: string): ProviderLogoutResult {
  return { ok: false, status: "unsupported", providerId, message };
}

export function parseCommandLine(commandLine: string): { command: string; args: string[] } {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  const trimmed = commandLine.trim();
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i]!;
    const next = trimmed[i + 1];

    if (char === "\\") {
      if (quote === "'") {
        current += char;
      } else if (quote === '"') {
        if (next === '"' || next === "\\") {
          current += next;
          i += 1;
        } else {
          current += char;
        }
      } else if (next && (/\s/.test(next) || next === "'" || next === '"' || next === "\\")) {
        current += next;
        i += 1;
      } else {
        current += char;
      }
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return {
    command: parts[0] ?? "",
    args: parts.slice(1),
  };
}

export function stripAnsi(value: string): string {
  const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g");
  return value.replace(ansiEscapePattern, "");
}

export function buildProviderAuthEnv(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = env[pathKey] ?? "";
  const npmPrefix = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  const candidates = [
    npmPrefix ? join(npmPrefix, "bin") : undefined,
    join(homedir(), ".npm-global", "bin"),
    join(homedir(), ".local", "bin"),
  ].filter((entry): entry is string => Boolean(entry));
  const entries = currentPath.split(delimiter).filter(Boolean);
  for (const candidate of candidates) {
    if (!entries.includes(candidate)) entries.push(candidate);
  }
  env[pathKey] = entries.join(delimiter);
  return env;
}

export const extractDeviceAuthDetails = extractSharedDeviceAuthDetails;

export function runAuthCommand(
  providerId: ProviderId,
  commandLine: string,
  args: string[],
  timeoutMs = 20_000,
  env?: NodeJS.ProcessEnv,
): Promise<ProviderLogoutResult> {
  return new Promise((resolve) => {
    const spawnSpec = parseCommandLine(commandLine);
    if (!spawnSpec.command) {
      resolve({ ok: false, status: "error", providerId, message: "No command configured" });
      return;
    }

    const child = spawn(spawnSpec.command, [...spawnSpec.args, ...args], {
      stdio: "pipe",
      windowsHide: true,
      shell: needsShell(spawnSpec.command),
      env: buildProviderAuthEnv(env),
    });
    let output = "";
    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-8000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    const timer = setTimeout(() => {
      killChildTree(child);
      resolve({
        ok: false,
        status: "error",
        providerId,
        message: `Command timed out: ${commandLine} ${args.join(" ")}`.trim(),
        rawOutput: stripAnsi(output).trim() || undefined,
      });
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timer);
      const clean = stripAnsi(output).trim();
      resolve({
        ok: code === 0,
        status: code === 0 ? "completed" : "error",
        providerId,
        message: code === 0 ? "Logout completed." : `Command exited with code ${code}.`,
        rawOutput: clean || undefined,
      });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        status: "error",
        providerId,
        message: error.message,
        rawOutput: stripAnsi(output).trim() || undefined,
      });
    });
  });
}

export function startDeviceLoginCommand(options: {
  providerId: ProviderId;
  label: string;
  commandLine: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<{ result: ProviderLoginResult; child?: ChildProcess }> {
  return new Promise((resolve) => {
    const spawnSpec = parseCommandLine(options.commandLine);
    if (!spawnSpec.command) {
      resolve({
        result: {
          ok: false,
          status: "error",
          providerId: options.providerId,
          message: "No command configured",
        },
      });
      return;
    }

    const child = spawn(spawnSpec.command, [...spawnSpec.args, ...options.args], {
      stdio: "pipe",
      windowsHide: true,
      shell: needsShell(spawnSpec.command),
      env: buildProviderAuthEnv(options.env),
    });

    let output = "";
    let settled = false;
    const timeoutMs = options.timeoutMs ?? 30_000;
    let partialDetailsTimer: ReturnType<typeof setTimeout> | null = null;
    const resolveStarted = (details: { verificationUri?: string; userCode?: string; requiresCodeInput?: boolean; inputPrompt?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (partialDetailsTimer) clearTimeout(partialDetailsTimer);
      resolve({
        child,
        result: {
          ok: true,
          status: "started",
          providerId: options.providerId,
          message: `${options.label} login started.`,
          verificationUri: details.verificationUri,
          userCode: details.userCode,
          requiresCodeInput: details.requiresCodeInput,
          inputPrompt: details.inputPrompt,
          rawOutput: stripAnsi(output).trim() || undefined,
        },
      });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      const details = extractDeviceAuthDetails(output);
      if (details.verificationUri || details.userCode) {
        resolveStarted(details);
        return;
      }
      settled = true;
      if (partialDetailsTimer) clearTimeout(partialDetailsTimer);
      killChildTree(child);
      resolve({
        result: {
          ok: false,
          status: "error",
          providerId: options.providerId,
          message: `${options.label} login did not emit a device code before timeout.`,
          rawOutput: stripAnsi(output).trim() || undefined,
        },
      });
    }, timeoutMs);

    const tryResolveStarted = () => {
      if (settled) return;
      const details = extractDeviceAuthDetails(output);
      if (!details.verificationUri && !details.userCode && !details.requiresCodeInput) return;
      // Immediately resolve when we have both parts, or when we know the CLI needs user input.
      if ((details.verificationUri && details.userCode) || details.requiresCodeInput) {
        resolveStarted(details);
        return;
      }
      if (!partialDetailsTimer) {
        partialDetailsTimer = setTimeout(() => {
          partialDetailsTimer = null;
          resolveStarted(extractDeviceAuthDetails(output));
        }, 1500);
      }
    };

    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-8000);
      tryResolveStarted();
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (partialDetailsTimer) clearTimeout(partialDetailsTimer);
      const clean = stripAnsi(output).trim();
      const details = extractDeviceAuthDetails(output);
      resolve({
        result: {
          ok: code === 0,
          status: code === 0 ? "completed" : "error",
          providerId: options.providerId,
          message: code === 0 ? `${options.label} login completed.` : `${options.label} login exited with code ${code}.`,
          verificationUri: details.verificationUri,
          userCode: details.userCode,
          rawOutput: clean || undefined,
        },
      });
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (partialDetailsTimer) clearTimeout(partialDetailsTimer);
      resolve({
        result: {
          ok: false,
          status: "error",
          providerId: options.providerId,
          message: error.message,
          rawOutput: stripAnsi(output).trim() || undefined,
        },
      });
    });
  });
}

export function killChildTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // fallback
    }
  }
  child.kill();
}

function needsShell(command: string): boolean {
  return process.platform === "win32" && !isAbsolute(command) && !command.includes("/") && !command.includes("\\");
}
