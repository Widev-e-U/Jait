import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function authPath(env?: NodeJS.ProcessEnv): string {
  const data = env?.XDG_DATA_HOME || join(env?.HOME || homedir(), ".local", "share");
  return join(data, "opencode", "auth.json");
}

function readAuth(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid credentials");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("OpenCode credentials could not be read. Existing credentials were preserved.");
  }
}

export function hasOpenCodeGoCredential(env?: NodeJS.ProcessEnv): boolean {
  try {
    const value = readAuth(authPath(env))["opencode-go"] as {type?: unknown; key?: unknown} | undefined;
    return value?.type === "api" && typeof value.key === "string" && Boolean(value.key.trim());
  } catch { return false; }
}

export function readOpenCodeGoCredential(env?: NodeJS.ProcessEnv): string | null {
  const value = readAuth(authPath(env))["opencode-go"] as { type?: unknown; key?: unknown } | undefined;
  return value?.type === "api" && typeof value.key === "string" && value.key.trim() ? value.key.trim() : null;
}

/** Preserve other connections and never put a key on a CLI command line. */
export function setOpenCodeGoCredential(apiKey: string | null, env?: NodeJS.ProcessEnv): void {
  const path = authPath(env);
  const auth = readAuth(path);
  if (apiKey === null) delete auth["opencode-go"];
  else auth["opencode-go"] = {type: "api", key: apiKey};
  const directory = path.slice(0, -"auth.json".length);
  mkdirSync(directory, {recursive: true, mode: 0o700});
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(auth), {mode: 0o600, flag: "wx"});
    renameSync(temporary, path);
  } finally { rmSync(temporary, {force: true}); }
}
