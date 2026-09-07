import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ProjectTransferInput {
  sourcePath: string;
  destinationPath: string;
  sshHost: string;
  sshUser: string;
  sshPort?: number;
}

export interface ProjectTransferResult {
  output: string;
}

export type ProjectTransferRunner = (input: ProjectTransferInput) => Promise<ProjectTransferResult>;

function validateSshPart(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required.`);
  if (/[^A-Za-z0-9._:-]/u.test(value)) throw new Error(`${label} contains unsupported characters.`);
}

function quoteRemotePath(value: string): string {
  if (/\0|\r|\n/u.test(value)) throw new Error("Destination path contains unsupported characters.");
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** Copy a local project to an SSH host using the gateway's configured SSH keys. */
export const transferProjectWithScp: ProjectTransferRunner = async (input) => {
  validateSshPart(input.sshHost, "sshHost");
  validateSshPart(input.sshUser, "sshUser");
  if (input.sshPort !== undefined && (!Number.isInteger(input.sshPort) || input.sshPort < 1 || input.sshPort > 65_535)) {
    throw new Error("sshPort must be an integer between 1 and 65535.");
  }

  const target = `${input.sshUser}@${input.sshHost}`;
  const sshOptions = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    ...(input.sshPort ? ["-p", String(input.sshPort)] : []),
  ];
  const remotePath = quoteRemotePath(input.destinationPath);
  const prepared = await execFileAsync(
    "ssh",
    [...sshOptions, target, `mkdir -p -- ${remotePath}`],
    { timeout: 30_000, maxBuffer: 1024 * 1024 },
  );

  const source = input.sourcePath.replace(/[\\/]+$/u, "") + "/.";
  const scpOptions = [
    "-r",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    ...(input.sshPort ? ["-P", String(input.sshPort)] : []),
  ];
  const copied = await execFileAsync(
    "scp",
    [...scpOptions, source, `${target}:${remotePath}`],
    { timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024 },
  );

  return {
    output: [prepared.stdout, prepared.stderr, copied.stdout, copied.stderr].filter(Boolean).join("\n").trim(),
  };
};
