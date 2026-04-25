import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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
  const parts = commandLine.trim().split(/\s+/).filter(Boolean);
  return {
    command: parts[0] ?? "",
    args: parts.slice(1),
  };
}

export function stripAnsi(value: string): string {
  const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g");
  return value.replace(ansiEscapePattern, "");
}

export function extractDeviceAuthDetails(output: string): { verificationUri?: string; userCode?: string } {
  const clean = stripAnsi(output);
  const verificationUri = clean.match(/https?:\/\/[^\s<>"')]+/i)?.[0]?.replace(/[.,;:]+$/, "");
  const codeShape = /^[A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){1,4}$/i;
  const normalizeCode = (value: string): string | undefined => {
    const candidate = value.trim().replace(/\s+/g, "-").toUpperCase();
    const compact = candidate.replace(/-/g, "");
    const blocked = new Set([
      "AUTHORIZATION",
      "AUTHORISATION",
      "AUTHENTICATION",
      "DEVICE",
      "LOGIN",
      "OPENAI",
      "CODE",
      "BROWSER",
      "THIS",
      "ONE",
      "TIME",
    ]);
    if (blocked.has(compact)) return undefined;
    const parts = candidate.split("-").filter(Boolean);
    if (parts.length > 1 && parts.every((part) => blocked.has(part))) return undefined;
    if (!/[0-9-]/.test(candidate) && compact.length > 10) return undefined;
    if (!codeShape.test(candidate)) return undefined;
    return candidate;
  };
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/enter\s+this\s+one-time\s+code/i.test(lines[index] ?? "")) continue;
    const nextLine = lines[index + 1];
    if (!nextLine) continue;
    const normalized = normalizeCode(nextLine);
    if (normalized) return { verificationUri, userCode: normalized };
  }
  const codePatterns = [
    /(?:user\s*)?code(?:\s+is)?\s*[:=]?\s*([A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){0,4})/i,
    /enter\s+(?:the\s+)?(?:code\s+)?([A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){1,4})/i,
    /copy\s+(?:the\s+)?(?:code\s+)?([A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){1,4})/i,
    /\b([A-Z0-9]{4,}(?:[- ][A-Z0-9]{4,}){1,4})\b/,
  ];
  let userCode: string | undefined;
  for (const pattern of codePatterns) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (const match of clean.matchAll(globalPattern)) {
      const raw = match[1]?.trim();
      if (!raw || /^HTTPS?$/i.test(raw)) continue;
      const normalized = normalizeCode(raw);
      if (normalized) {
        userCode = normalized;
        break;
      }
    }
    if (userCode) {
      break;
    }
  }
  return { verificationUri, userCode };
}

export function runAuthCommand(
  providerId: ProviderId,
  commandLine: string,
  args: string[],
  timeoutMs = 20_000,
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
      shell: process.platform === "win32",
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
      shell: process.platform === "win32",
    });

    let output = "";
    let settled = false;
    const timeoutMs = options.timeoutMs ?? 30_000;
    let partialDetailsTimer: ReturnType<typeof setTimeout> | null = null;
    const resolveStarted = (details: { verificationUri?: string; userCode?: string }) => {
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
      if (!details.verificationUri && !details.userCode) return;
      if (details.verificationUri && details.userCode) {
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
