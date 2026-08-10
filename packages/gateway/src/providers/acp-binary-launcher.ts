import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface BinarySpec {
  id: string;
  version: string;
  target: string;
  archive: string;
  cmd: string;
  args: string[];
  env: Record<string, string>;
  sha256?: string;
}

async function main(): Promise<void> {
  const spec = parseSpec(process.argv[2]);
  const forwardedArgs = process.argv.slice(3);
  const command = await ensureInstalled(spec);
  const child = spawn(command, [...spec.args, ...forwardedArgs], {
    stdio: "inherit",
    env: { ...process.env, ...spec.env },
    windowsHide: true,
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.once("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

async function ensureInstalled(spec: BinarySpec): Promise<string> {
  const root = process.env.JAIT_ACP_BINARY_ROOT?.trim() || join(homedir(), ".jait", "acp-agents");
  const installDir = join(root, spec.id, spec.version, spec.target);
  const command = resolveArchiveCommand(installDir, spec.cmd);
  const marker = join(installDir, ".jait-acp-install.json");
  if (await isCurrentInstall(marker, command, spec)) return command;

  await mkdir(dirname(installDir), { recursive: true, mode: 0o700 });
  const lockDir = `${installDir}.lock`;
  const ownsLock = await acquireLock(lockDir);
  if (!ownsLock) {
    if (await isCurrentInstall(marker, command, spec)) return command;
    throw new Error(`Timed out installing ACP agent ${spec.id}`);
  }

  try {
    if (await isCurrentInstall(marker, command, spec)) return command;
    const temporaryRoot = await mkdtemp(join(dirname(installDir), ".install-"));
    try {
      const archivePath = join(temporaryRoot, archiveFileName(spec.archive));
      const extractDir = join(temporaryRoot, "files");
      await mkdir(extractDir, { recursive: true, mode: 0o700 });
      const response = await fetch(spec.archive, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
      const archive = Buffer.from(await response.arrayBuffer());
      if (spec.sha256) {
        const digest = createHash("sha256").update(archive).digest("hex");
        if (digest !== spec.sha256) throw new Error(`Checksum mismatch for ACP agent ${spec.id}`);
      }
      await writeFile(archivePath, archive, { mode: 0o600 });
      await validateArchiveEntries(archivePath);
      await extractArchive(archivePath, extractDir);
      const extractedCommand = resolveArchiveCommand(extractDir, spec.cmd);
      const realCommand = await realpath(extractedCommand);
      assertInside(extractDir, realCommand);
      if (process.platform !== "win32") await chmod(realCommand, 0o755);
      await rm(installDir, { recursive: true, force: true });
      await rename(extractDir, installDir);
      await writeFile(marker, JSON.stringify({
        archive: spec.archive,
        sha256: spec.sha256 ?? null,
        cmd: spec.cmd,
      }), { encoding: "utf8", mode: 0o600 });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }

  return command;
}

async function acquireLock(lockDir: string): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    try {
      await mkdir(lockDir);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lockStat = await stat(lockDir).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > 5 * 60_000) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    }
  }
  return false;
}

async function isCurrentInstall(marker: string, command: string, spec: BinarySpec): Promise<boolean> {
  try {
    const stored = JSON.parse(await readFile(marker, "utf8")) as Record<string, unknown>;
    await stat(command);
    return stored.archive === spec.archive && stored.sha256 === (spec.sha256 ?? null) && stored.cmd === spec.cmd;
  } catch {
    return false;
  }
}

async function validateArchiveEntries(archivePath: string): Promise<void> {
  const zip = archivePath.toLowerCase().endsWith(".zip");
  const { stdout } = zip && process.platform !== "win32"
    ? await execFileAsync("unzip", ["-Z1", archivePath], { maxBuffer: 8 * 1024 * 1024 })
    : await execFileAsync("tar", ["-tf", archivePath], { maxBuffer: 8 * 1024 * 1024 });
  for (const entry of stdout.split(/\r?\n/)) {
    if (!entry) continue;
    const normalized = entry.replaceAll("\\", "/");
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)
      || normalized.split("/").includes("..")) {
      throw new Error(`Unsafe path in ACP agent archive: ${entry}`);
    }
  }
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  if (archivePath.toLowerCase().endsWith(".zip") && process.platform !== "win32") {
    await execFileAsync("unzip", ["-q", archivePath, "-d", destination]);
    return;
  }
  await execFileAsync("tar", ["-xf", archivePath, "-C", destination]);
}

function resolveArchiveCommand(root: string, command: string): string {
  const normalized = command.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error("ACP registry supplied an unsafe binary command path");
  }
  const resolved = resolve(root, ...normalized.split("/"));
  assertInside(root, resolved);
  return resolved;
}

function assertInside(root: string, candidate: string): void {
  const pathFromRoot = relative(resolve(root), resolve(candidate));
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error("ACP agent archive escaped its install directory");
  }
}

function archiveFileName(url: string): string {
  try {
    const name = basename(new URL(url).pathname);
    if (name) return name;
  } catch {}
  return "agent-archive";
}

function parseSpec(encoded: string | undefined): BinarySpec {
  if (!encoded) throw new Error("Missing ACP binary launch specification");
  const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  const version = typeof value.version === "string" ? value.version : "";
  const target = typeof value.target === "string" ? value.target : "";
  const archive = typeof value.archive === "string" ? value.archive : "";
  const cmd = typeof value.cmd === "string" ? value.cmd : "";
  if (!/^[a-z][a-z0-9-]*$/.test(id) || !version || !target || !cmd) {
    throw new Error("Invalid ACP binary launch specification");
  }
  const archiveUrl = new URL(archive);
  if (archiveUrl.protocol !== "https:") throw new Error("ACP binary downloads must use HTTPS");
  const sha256 = typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256)
    ? value.sha256.toLowerCase()
    : undefined;
  return {
    id,
    version,
    target,
    archive: archiveUrl.toString(),
    cmd,
    args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string") : [],
    env: value.env && typeof value.env === "object" && !Array.isArray(value.env)
      ? Object.fromEntries(Object.entries(value.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {},
    ...(sha256 ? { sha256 } : {}),
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
