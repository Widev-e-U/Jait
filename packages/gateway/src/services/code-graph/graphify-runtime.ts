import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const GRAPHIFY_PACKAGE_NAME = "graphifyy";
export const GRAPHIFY_PACKAGE_VERSION = "0.9.30";
export const GRAPHIFY_MIN_PYTHON_VERSION = "3.10";

interface ExecuteOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface ExecuteResult {
  stdout: string;
  stderr: string;
}

type Execute = (command: string, args: string[], options?: ExecuteOptions) => Promise<ExecuteResult>;

export interface GraphifyRuntimePaths {
  runtimeDir: string;
  venvDir: string;
  pythonPath: string;
  commandPath: string;
  metadataPath: string;
}

export interface GraphifyRuntimeStatus {
  ready: boolean;
  managed: boolean;
  command: string;
  version: string | null;
  expectedVersion: string;
  error: string | null;
}

export interface EnsureGraphifyRuntimeOptions {
  jaitDir?: string;
  env?: NodeJS.ProcessEnv;
  execute?: Execute;
  onProgress?: (message: string) => void;
}

interface PythonCandidate {
  command: string;
  prefixArgs: string[];
}

export class GraphifyRuntimeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GraphifyRuntimeError";
  }
}

const installs = new Map<string, Promise<GraphifyRuntimeStatus>>();

async function defaultExecute(command: string, args: string[], options: ExecuteOptions = {}): Promise<ExecuteResult> {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

export function getGraphifyRuntimePaths(jaitDir = join(homedir(), ".jait")): GraphifyRuntimePaths {
  const runtimeDir = join(jaitDir, "runtime", "graphify");
  const venvDir = join(runtimeDir, "venv");
  const windows = platform() === "win32";
  return {
    runtimeDir,
    venvDir,
    pythonPath: join(venvDir, windows ? "Scripts" : "bin", windows ? "python.exe" : "python"),
    commandPath: join(venvDir, windows ? "Scripts" : "bin", windows ? "graphify.exe" : "graphify"),
    metadataPath: join(runtimeDir, "runtime.json"),
  };
}

export function resolveGraphifyCommand(options: { jaitDir?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const env = options.env ?? process.env;
  return env["JAIT_GRAPHIFY_COMMAND"]?.trim() || getGraphifyRuntimePaths(options.jaitDir).commandPath;
}

function includesExpectedVersion(output: string): boolean {
  const escaped = GRAPHIFY_PACKAGE_VERSION.replaceAll(".", "\\.");
  return new RegExp(`(^|\\D)${escaped}(\\D|$)`).test(output);
}

function parsePythonVersion(output: string): [number, number] | null {
  const match = output.match(/Python\s+(\d+)\.(\d+)/i);
  if (!match) return null;
  return [Number.parseInt(match[1]!, 10), Number.parseInt(match[2]!, 10)];
}

function supportedPython(version: [number, number]): boolean {
  return version[0] > 3 || (version[0] === 3 && version[1] >= 10);
}

function pythonCandidates(env: NodeJS.ProcessEnv): PythonCandidate[] {
  const configured = env["JAIT_GRAPHIFY_PYTHON"]?.trim();
  const candidates: PythonCandidate[] = [];
  if (configured) candidates.push({ command: configured, prefixArgs: [] });
  if (platform() === "win32") candidates.push({ command: "py", prefixArgs: ["-3"] });
  candidates.push({ command: "python3", prefixArgs: [] }, { command: "python", prefixArgs: [] });
  return candidates;
}

async function probeGraphify(command: string, execute: Execute, env: NodeJS.ProcessEnv): Promise<{ version: string | null; error: string | null }> {
  try {
    const result = await execute(command, ["--version"], { env });
    const version = (result.stdout || result.stderr).trim() || null;
    return { version, error: version ? null : "Graphify returned no version information" };
  } catch (error) {
    return {
      version: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function findPython(execute: Execute, env: NodeJS.ProcessEnv): Promise<PythonCandidate> {
  const failures: string[] = [];
  for (const candidate of pythonCandidates(env)) {
    try {
      const result = await execute(candidate.command, [...candidate.prefixArgs, "--version"], { env });
      const output = `${result.stdout}\n${result.stderr}`.trim();
      const version = parsePythonVersion(output);
      if (version && supportedPython(version)) return candidate;
      failures.push(`${candidate.command}: ${output || "unknown version"}`);
    } catch {
      failures.push(`${candidate.command}: unavailable`);
    }
  }
  throw new GraphifyRuntimeError(
    `Graphify requires Python ${GRAPHIFY_MIN_PYTHON_VERSION} or newer. Install Python and restart Jait. Checked: ${failures.join(", ")}`,
  );
}

export async function inspectGraphifyRuntime(options: Pick<EnsureGraphifyRuntimeOptions, "jaitDir" | "env" | "execute"> = {}): Promise<GraphifyRuntimeStatus> {
  const env = options.env ?? process.env;
  const execute = options.execute ?? defaultExecute;
  const command = resolveGraphifyCommand({ jaitDir: options.jaitDir, env });
  const managed = !env["JAIT_GRAPHIFY_COMMAND"]?.trim();
  const probe = await probeGraphify(command, execute, env);
  const ready = Boolean(probe.version) && (!managed || includesExpectedVersion(probe.version!));
  return {
    ready,
    managed,
    command,
    version: probe.version,
    expectedVersion: GRAPHIFY_PACKAGE_VERSION,
    error: ready
      ? null
      : probe.version && managed
        ? `Expected Graphify ${GRAPHIFY_PACKAGE_VERSION}, found ${probe.version}`
        : probe.error,
  };
}

async function provisionGraphifyRuntime(options: EnsureGraphifyRuntimeOptions): Promise<GraphifyRuntimeStatus> {
  const env = options.env ?? process.env;
  const execute = options.execute ?? defaultExecute;
  const paths = getGraphifyRuntimePaths(options.jaitDir);
  const configuredCommand = env["JAIT_GRAPHIFY_COMMAND"]?.trim();

  if (configuredCommand) {
    const status = await inspectGraphifyRuntime({ jaitDir: options.jaitDir, env, execute });
    if (!status.ready) {
      throw new GraphifyRuntimeError(
        `JAIT_GRAPHIFY_COMMAND points to an unusable Graphify executable (${configuredCommand}): ${status.error ?? "version probe failed"}`,
      );
    }
    return status;
  }

  const existing = await inspectGraphifyRuntime({ jaitDir: options.jaitDir, env, execute });
  if (existing.ready) return existing;

  options.onProgress?.(`Installing required Graphify ${GRAPHIFY_PACKAGE_VERSION} runtime...`);
  await mkdir(paths.runtimeDir, { recursive: true });
  const python = await findPython(execute, env);

  try {
    await execute(python.command, [...python.prefixArgs, "-m", "venv", paths.venvDir], { env });
    await execute(
      paths.pythonPath,
      [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--upgrade",
        `${GRAPHIFY_PACKAGE_NAME}==${GRAPHIFY_PACKAGE_VERSION}`,
      ],
      { env },
    );
  } catch (error) {
    throw new GraphifyRuntimeError(
      `Jait could not install Graphify ${GRAPHIFY_PACKAGE_VERSION}. Ensure Python ${GRAPHIFY_MIN_PYTHON_VERSION}+ includes venv and pip, then run jait doctor.`,
      { cause: error },
    );
  }

  const status = await inspectGraphifyRuntime({ jaitDir: options.jaitDir, env, execute });
  if (!status.ready) {
    throw new GraphifyRuntimeError(`Graphify installation completed but validation failed: ${status.error ?? "unknown error"}`);
  }

  await writeFile(
    paths.metadataPath,
    `${JSON.stringify({
      package: GRAPHIFY_PACKAGE_NAME,
      version: GRAPHIFY_PACKAGE_VERSION,
      command: paths.commandPath,
      installedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    "utf8",
  );
  options.onProgress?.(`Graphify ${GRAPHIFY_PACKAGE_VERSION} is ready.`);
  return status;
}

export async function ensureGraphifyRuntime(options: EnsureGraphifyRuntimeOptions = {}): Promise<GraphifyRuntimeStatus> {
  const env = options.env ?? process.env;
  const key = `${options.jaitDir ?? join(homedir(), ".jait")}:${env["JAIT_GRAPHIFY_COMMAND"]?.trim() ?? "managed"}`;
  const existing = installs.get(key);
  if (existing) return existing;

  const install = provisionGraphifyRuntime(options).finally(() => installs.delete(key));
  installs.set(key, install);
  return install;
}

export async function graphifyRuntimeFilesExist(jaitDir?: string): Promise<boolean> {
  const paths = getGraphifyRuntimePaths(jaitDir);
  try {
    await access(paths.commandPath);
    return true;
  } catch {
    return false;
  }
}
