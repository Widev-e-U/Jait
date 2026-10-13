import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitService } from "./git.js";

function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}

/**
 * `createWorktree` receives a plain branch name (normally the repository
 * default branch). A pull-request / CI checkout, a detached build agent and a
 * single-branch clone have no *local* ref for that name, so the raw name is not
 * a valid start point for `git worktree add -b`:
 * `fatal: invalid reference: main` (newer git) or
 * `fatal: not a valid object name: 'main'` (older git).
 * These fixtures reproduce that layout with a local file remote, so no network
 * is required.
 */
describe("createWorktree without a local default branch", () => {
  let root: string;
  let origin: string;
  let worktreesRoot: string;
  let svc: GitService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "git-worktree-base-"));
    origin = join(root, "origin");
    worktreesRoot = join(root, "worktrees");
    await mkdir(origin, { recursive: true });
    await mkdir(worktreesRoot, { recursive: true });
    git(origin, "init");
    git(origin, "config user.email test@test.com");
    git(origin, "config user.name Test");
    await writeFile(join(origin, "file.txt"), "hello");
    git(origin, "add -A");
    git(origin, "commit -m initial");
    git(origin, "branch -M main");
    svc = new GitService();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** Clone the origin, then strip the local default branch like a PR checkout does. */
  async function prStyleCheckout(name: string, opts: { keepTrackingRef?: boolean } = {}) {
    const dir = join(root, name);
    git(root, `clone "${origin}" "${dir}"`);
    git(dir, "config user.email test@test.com");
    git(dir, "config user.name Test");
    git(dir, "checkout --detach refs/remotes/origin/main");
    git(dir, "branch -D main");
    if (opts.keepTrackingRef === false) {
      git(dir, "update-ref -d refs/remotes/origin/main");
    }
    return dir;
  }

  const expectedTip = () => git(origin, "rev-parse main");

  it("resolves the remote-tracking ref when only refs/remotes/origin/main exists", async () => {
    const checkout = await prStyleCheckout("pr-checkout");
    expect(() => git(checkout, "rev-parse --verify refs/heads/main")).toThrow();

    const fast = await svc.createWorktree(
      checkout,
      "main",
      "jait/aaaa1111",
      join(worktreesRoot, "fast"),
      { fastPath: true },
    );
    expect(git(fast.path, "rev-parse HEAD")).toBe(expectedTip());
    expect(git(fast.path, "branch --show-current")).toBe("jait/aaaa1111");
    expect(existsSync(join(fast.path, "file.txt"))).toBe(true);
    expect(git(fast.path, "status --porcelain")).toBe("");

    const plain = await svc.createWorktree(
      checkout,
      "main",
      "jait/bbbb2222",
      join(worktreesRoot, "plain"),
      { fastPath: false },
    );
    expect(git(plain.path, "rev-parse HEAD")).toBe(expectedTip());
    expect(git(plain.path, "branch --show-current")).toBe("jait/bbbb2222");

    // The base was only available as a remote-tracking ref here. Recording it
    // as the new branch's upstream (git's default for that start point, logged
    // as "branch 'x' set up to track 'origin/main'") would let an unattended
    // push with push.default=current/upstream target the default branch.
    for (const branch of ["jait/aaaa1111", "jait/bbbb2222"]) {
      expect(() => git(checkout, `config --get branch.${branch}.remote`)).toThrow();
      expect(() => git(checkout, `config --get branch.${branch}.merge`)).toThrow();
    }
  });

  it("fetches the base branch when no local or remote-tracking ref exists", async () => {
    const checkout = await prStyleCheckout("shallow-checkout", { keepTrackingRef: false });
    expect(() => git(checkout, "rev-parse --verify refs/remotes/origin/main")).toThrow();
    expect(() => git(checkout, "rev-parse --verify refs/heads/main")).toThrow();

    const result = await svc.createWorktree(
      checkout,
      "main",
      "jait/cccc3333",
      join(worktreesRoot, "fetched"),
      { fastPath: false },
    );
    expect(git(result.path, "rev-parse HEAD")).toBe(expectedTip());
    expect(git(result.path, "branch --show-current")).toBe("jait/cccc3333");
    expect(existsSync(join(result.path, "file.txt"))).toBe(true);
  });

  it("still uses the local branch when it exists", async () => {
    const clone = join(root, "normal-clone");
    git(root, `clone "${origin}" "${clone}"`);
    const result = await svc.createWorktree(
      clone,
      "main",
      "jait/dddd4444",
      join(worktreesRoot, "local"),
      { fastPath: false },
    );
    expect(git(result.path, "branch --show-current")).toBe("jait/dddd4444");
    expect(git(result.path, "rev-parse HEAD")).toBe(expectedTip());
  });

  it("reports an actionable error when the base branch cannot be resolved", async () => {
    const clone = await prStyleCheckout("missing-base");
    await expect(
      svc.createWorktree(
        clone,
        "does-not-exist",
        "jait/eeee5555",
        join(worktreesRoot, "missing"),
        { fastPath: false },
      ),
    ).rejects.toThrow(/Cannot resolve worktree base branch "does-not-exist"/);
  });
});
