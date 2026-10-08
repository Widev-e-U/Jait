import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { worktreeGitMountArgs } from "./worktree-sandbox.js";

const scratch: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "jait-git-sandbox-")); scratch.push(root);
  const repo = join(root, "repo"), worktree = join(root, "worktree"); mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init"); writeFileSync(join(repo, "owned.txt"), "before\n"); git("add", "owned.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  git("worktree", "add", "-b", "delivery", worktree);
  writeFileSync(join(worktree, "owned.txt"), "after\n");
  return { root, repo, worktree };
}
afterEach(() => { for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("registered worktree sandbox Git", () => {
  it("mounts registered metadata read-only without exposing the main checkout", () => {
    const { repo, worktree } = fixture();
    expect(worktreeGitMountArgs(worktree)).toEqual(["-v", `${repo}/.git:${repo}/.git:ro`]);
    expect(worktreeGitMountArgs(repo)).toEqual([]);
  });
  it("refuses a forged worktree pointer to another worktree", () => {
    const { root, worktree } = fixture();
    const forged = join(root, "forged"); mkdirSync(forged);
    writeFileSync(join(forged, ".git"), readFileSync(join(worktree, ".git")));
    expect(() => worktreeGitMountArgs(forged)).toThrow("does not belong");
  });
  it.runIf(process.env.JAIT_TEST_SANDBOX === "1")("runs actual Git status and diff in an isolated non-root container", () => {
    const { repo, worktree } = fixture();
    const mainBefore = readFileSync(join(repo, "owned.txt"), "utf8");
    // Reproduce the old mount configuration: the worktree's gitdir pointer
    // points outside /project and Git cannot inspect this checkout.
    expect(() => execFileSync("docker", ["run", "--rm", "--network", "none", "--user", `${process.getuid!()}:${process.getgid!()}`,
      "-e", "HOME=/tmp", "-v", `${worktree}:/project`, "-w", "/project", "jait/sandbox:latest", "git", "status", "--short"],
      { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] })).toThrow(/not a git repository/);
    const output = execFileSync("docker", ["run", "--rm", "--network", "none", "--user", `${process.getuid!()}:${process.getgid!()}`,
      "-e", "HOME=/tmp", "-v", `${worktree}:/project`, ...worktreeGitMountArgs(worktree), "-w", "/project", "jait/sandbox:latest",
      "sh", "-c", "git status --short && git diff --name-only"], { encoding: "utf8", timeout: 20_000 });
    expect(output).toContain(" M owned.txt");
    expect(output.trim().split("\n").at(-1)).toBe("owned.txt");
    expect(readFileSync(join(repo, "owned.txt"), "utf8")).toBe(mainBefore);
  });
});
