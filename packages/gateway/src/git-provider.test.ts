import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GitService, detectGitRemoteProvider, parseGitRemote } from "./services/git.js";

describe("git remote provider detection", () => {
  it("detects GitHub, Azure DevOps, and Gitea remotes", () => {
    expect(detectGitRemoteProvider("git@github.com:acme/repo.git")).toBe("github");
    expect(detectGitRemoteProvider("git@ssh.dev.azure.com:v3/acme/project/repo")).toBe("azure-devops");
    expect(detectGitRemoteProvider("https://gitea.example.com/acme/repo.git")).toBe("gitea");
  });

  it("parses Azure DevOps remotes into organization/project/repo", () => {
    expect(parseGitRemote("https://dev.azure.com/acme/project/_git/repo")).toEqual({
      provider: "azure-devops",
      host: "dev.azure.com",
      normalizedUrl: "https://dev.azure.com/acme/project/_git/repo",
      organization: "acme",
      project: "project",
      repo: "repo",
    });
  });

  it("parses GitHub remotes from HTTPS and SSH forms", () => {
    expect(parseGitRemote("https://github.com/acme/repo.git")).toEqual({
      provider: "github",
      host: "github.com",
      normalizedUrl: "https://github.com/acme/repo",
      owner: "acme",
      repo: "repo",
    });
    expect(parseGitRemote("git@github.com:acme/repo.git")).toEqual({
      provider: "github",
      host: "github.com",
      normalizedUrl: "https://github.com/acme/repo",
      owner: "acme",
      repo: "repo",
    });
  });

  it("parses Azure DevOps SSH remotes into the canonical HTTPS form", () => {
    expect(parseGitRemote("git@ssh.dev.azure.com:v3/acme/project/repo")).toEqual({
      provider: "azure-devops",
      host: "dev.azure.com",
      normalizedUrl: "https://dev.azure.com/acme/project/_git/repo",
      organization: "acme",
      project: "project",
      repo: "repo",
    });
  });

  it("parses legacy visualstudio.com remotes", () => {
    expect(parseGitRemote("https://acme.visualstudio.com/project/_git/repo")).toEqual({
      provider: "azure-devops",
      host: "acme.visualstudio.com",
      normalizedUrl: "https://acme.visualstudio.com/project/_git/repo",
      organization: "acme",
      project: "project",
      repo: "repo",
    });
  });

  it("parses GitLab remotes with nested group paths", () => {
    expect(parseGitRemote("https://gitlab.com/group/subgroup/repo.git")).toEqual({
      provider: "gitlab",
      host: "gitlab.com",
      normalizedUrl: "https://gitlab.com/group/subgroup/repo",
      owner: "group/subgroup",
      repo: "repo",
    });
  });

  it("parses Bitbucket remotes", () => {
    expect(parseGitRemote("https://bitbucket.org/acme/repo.git")).toEqual({
      provider: "bitbucket",
      host: "bitbucket.org",
      normalizedUrl: "https://bitbucket.org/acme/repo",
      owner: "acme",
      repo: "repo",
    });
  });

  it("returns null for null, empty, or unparseable remotes", () => {
    expect(parseGitRemote(null)).toBeNull();
    expect(parseGitRemote("")).toBeNull();
    expect(parseGitRemote("   ")).toBeNull();
    expect(parseGitRemote("not a url")).toBeNull();
    expect(parseGitRemote("https://github.com/acme")).toBeNull();
  });

  it("reports 'none' for null and 'unknown' for unparseable remotes", () => {
    expect(detectGitRemoteProvider(null)).toBe("none");
    expect(detectGitRemoteProvider("garbage")).toBe("unknown");
  });
});

describe("buildCreatePrUrl", () => {
  it("builds provider-specific PR URLs", async () => {
    const git = new GitService();
    vi.spyOn(git, "getPreferredRemote").mockResolvedValue("origin");
    const remoteUrlSpy = vi.spyOn(git, "getRemoteUrl");
    remoteUrlSpy.mockResolvedValueOnce("git@github.com:acme/repo.git");
    await expect(git.buildCreatePrUrl("/repo", "feature/test", "origin", "main")).resolves.toBe(
      "https://github.com/acme/repo/compare/main...feature%2Ftest?expand=1",
    );

    remoteUrlSpy.mockResolvedValueOnce("https://dev.azure.com/acme/project/_git/repo");
    await expect(git.buildCreatePrUrl("/repo", "feature/test", "origin", "main")).resolves.toBe(
      "https://dev.azure.com/acme/project/_git/repo/pullrequestcreate?sourceRef=refs%2Fheads%2Ffeature%2Ftest&targetRef=refs%2Fheads%2Fmain",
    );

    remoteUrlSpy.mockResolvedValueOnce("https://gitea.example.com/acme/repo.git");
    await expect(git.buildCreatePrUrl("/repo", "feature/test", "origin", "main")).resolves.toBe(
      "https://gitea.example.com/acme/repo/compare/main...feature%2Ftest",
    );
  });
});

describe("discardChanges", () => {
  it("discards staged-only tracked file changes", { timeout: 15_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "jait-git-discard-"));
    try {
      execSync("git init", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "base\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "changed\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await expect(git.discardChanges(root, ["file.txt"])).resolves.toEqual({ discardedCount: 1 });

      expect(readFileSync(join(root, "file.txt"), "utf8")).toBe("base\n");
      expect(execSync("git status --short", { cwd: root, encoding: "utf8" }).trim()).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("diffStats", () => {
  it("returns branch-scoped totals for committed thread changes", { timeout: 15_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "jait-git-diff-stats-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "base\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/thread", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "file.txt"), "base\nextra\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "thread change"', { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await expect(git.diffStats(root, "main")).resolves.toEqual({
        files: 1,
        insertions: 1,
        deletions: 0,
        hasChanges: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("can target a recorded branch even after checking out another branch", { timeout: 15_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "jait-git-diff-stats-branch-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "base\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/one", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "file.txt"), "base\none\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "feature one"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });
      execSync("git checkout -b feature/two", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "file.txt"), "base\ntwo\nthree\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "feature two"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await expect(git.diffStats(root, "main", "feature/one")).resolves.toEqual({
        files: 1,
        insertions: 1,
        deletions: 0,
        hasChanges: true,
      });
      await expect(git.diffStats(root, "main", "feature/two")).resolves.toEqual({
        files: 1,
        insertions: 2,
        deletions: 0,
        hasChanges: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps recorded branch totals scoped to PR changes after main advances", { timeout: 15_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "jait-git-diff-stats-merged-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "base.txt"), "base\n");
      execSync("git add base.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/thread", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "thread.txt"), "thread\n");
      execSync("git add thread.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "thread change"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });
      execSync('git merge --no-ff feature/thread -m "merge thread"', { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "main-only.txt"), "main only\n");
      execSync("git add main-only.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "main advances"', { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await expect(git.diffStats(root, "main", "feature/thread")).resolves.toEqual({
        files: 1,
        insertions: 1,
        deletions: 0,
        hasChanges: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not mix local untracked files into recorded branch totals", { timeout: 15_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "jait-git-diff-stats-untracked-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "base.txt"), "base\n");
      execSync("git add base.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/thread", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "thread.txt"), "thread\n");
      execSync("git add thread.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "thread change"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "scratch.txt"), "local only\n");

      const git = new GitService();
      await expect(git.diffStats(root, "main", "feature/thread")).resolves.toEqual({
        files: 1,
        insertions: 1,
        deletions: 0,
        hasChanges: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
