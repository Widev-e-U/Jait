import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveGraphifyCommand } from "./graphify-runtime.js";

const execFileAsync = promisify(execFile);

export interface GraphifyRunResult {
  graphPath: string;
  version: string | null;
  stdout: string;
  stderr: string;
}

export interface GraphifyRunnerOptions {
  command?: string;
  execute?: (
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal },
  ) => Promise<{ stdout: string; stderr: string }>;
}

export class GraphifyUnavailableError extends Error {
  constructor(message = "The required Graphify runtime is unavailable. Run jait doctor for diagnostics.") {
    super(message);
    this.name = "GraphifyUnavailableError";
  }
}

async function defaultExecute(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal },
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      maxBuffer: 16 * 1024 * 1024,
      encoding: "utf8",
    });
    return {
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "ENOENT") throw new GraphifyUnavailableError();
    throw error;
  }
}

export class GraphifyRunner {
  private readonly command: string;
  private readonly execute: NonNullable<GraphifyRunnerOptions["execute"]>;

  constructor(options: GraphifyRunnerOptions = {}) {
    this.command = options.command ?? resolveGraphifyCommand();
    this.execute = options.execute ?? defaultExecute;
  }

  async getVersion(cwd: string): Promise<string | null> {
    try {
      const result = await this.execute(this.command, ["--version"], {
        cwd,
        env: process.env,
      });
      return (result.stdout || result.stderr).trim() || null;
    } catch (error) {
      if (error instanceof GraphifyUnavailableError) throw error;
      return null;
    }
  }

  async build(params: {
    projectRoot: string;
    outputDir: string;
    signal?: AbortSignal;
  }): Promise<GraphifyRunResult> {
    await mkdir(params.outputDir, { recursive: true });
    const version = await this.getVersion(params.projectRoot);
    const result = await this.execute(
      this.command,
      [
        "extract",
        params.projectRoot,
        "--code-only",
        "--out",
        params.outputDir,
      ],
      {
        cwd: params.projectRoot,
        env: {
          ...process.env,
          GRAPHIFY_QUERY_LOG_DISABLE: "1",
        },
        signal: params.signal,
      },
    );

    const graphifyPath = join(params.outputDir, "graphify-out", "graph.json");
    const legacyPath = join(params.outputDir, "graph.json");
    let graphPath = graphifyPath;
    try {
      await access(graphifyPath);
    } catch {
      try {
        await access(legacyPath);
        graphPath = legacyPath;
      } catch {}
    }

    return {
      graphPath,
      version,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}
