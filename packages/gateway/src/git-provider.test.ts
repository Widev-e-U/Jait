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
