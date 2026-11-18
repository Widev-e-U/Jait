import { spawnSync } from "node:child_process";
import { basename } from "node:path";

/** Parse only: reject incomplete POSIX input before it can poison an interactive PTY. */
export function commandSyntaxError(command: string, shell: string): string | null {
  const kind = basename(shell);
  if (!["bash", "sh", "zsh"].includes(kind)) return null;
  const args = kind === "bash" ? ["--noprofile", "--norc", "-n"] : ["-f", "-n"];
  const result = spawnSync(shell, args, {
    input: command, encoding: "utf8", timeout: 1000, maxBuffer: 8000,
    env: { ...process.env, BASH_ENV: "/dev/null", ENV: "/dev/null" },
  });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") return null;
  if (result.error) return `Shell syntax check failed: ${result.error.message}`;
  return result.status === 0 ? null : `Invalid shell syntax: ${result.stderr.trim().slice(0, 2000)}`;
}
