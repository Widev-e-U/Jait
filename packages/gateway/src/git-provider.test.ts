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
});

describe("buildCreatePrUrl", () => {
  it("builds provider-specific PR URLs", async () => {
    const git = new GitService();
    vi.spyOn(git, "getPreferredRemote").mockResolvedValue("origin");
    const remoteUrlSpy = vi.spyOn(git, "getRemoteUrl");
    remoteUrlSpy.mockResolvedValueOnce("git@github.com:acme/repo.git");
    await expect(git.buildCreatePrUrl("/repo", "feature/test", "origin", "main")).resolves.toBe(
      "https://github.com/acme/repo/compare/feature%2Ftest?expand=1",
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
});
