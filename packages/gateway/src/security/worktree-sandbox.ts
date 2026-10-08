import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** Expose only registered worktree metadata, read-only, at its original path. */
export function worktreeGitMountArgs(projectRoot: string): string[] {
  const marker = join(projectRoot, ".git");
  if (!existsSync(marker) || lstatSync(marker).isDirectory()) return [];
  if (lstatSync(marker).isSymbolicLink()) throw new Error("Worktree Git marker must not be a symlink.");
  const pointer = /^gitdir: (.+)\s*$/m.exec(readFileSync(marker, "utf8"));
  if (!pointer) throw new Error("Invalid worktree Git marker. Repair it on the host before running this thread.");
  const admin = realpathSync(resolve(projectRoot, pointer[1]!.trim()));
  const common = realpathSync(resolve(admin, readFileSync(join(admin, "commondir"), "utf8").trim()));
  const backlink = resolve(admin, readFileSync(join(admin, "gitdir"), "utf8").trim());
  if (basename(common) !== ".git" || dirname(admin) !== join(common, "worktrees")
    || realpathSync(backlink) !== realpathSync(marker) || common.includes(":")) {
    throw new Error("Git metadata does not belong to this registered worktree.");
  }
  // Never expose the main checkout or grant write access to shared refs/config.
  // Git mutations use the existing host-side Git service and consent path.
  return ["-v", `${common}:${common}:ro`];
}
