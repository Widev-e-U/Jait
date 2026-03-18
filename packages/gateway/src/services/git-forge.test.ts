import { describe, it, expect } from "vitest";
import { getForge, getForgeForRemote, GitHubForge, GitLabForge, GiteaForge, AzureDevOpsForge, BitbucketForge } from "./git-forge.js";

describe("git-forge factory", () => {
  it("returns correct forge for each provider", () => {
    expect(getForge("github")).toBeInstanceOf(GitHubForge);
    expect(getForge("gitlab")).toBeInstanceOf(GitLabForge);
    expect(getForge("gitea")).toBeInstanceOf(GiteaForge);
    expect(getForge("azure-devops")).toBeInstanceOf(AzureDevOpsForge);
    expect(getForge("bitbucket")).toBeInstanceOf(BitbucketForge);
  });

  it("returns null for unknown/none providers", () => {
    expect(getForge("unknown")).toBeNull();
    expect(getForge("none")).toBeNull();
  });

  it("caches forge instances", () => {
    const a = getForge("github");
    const b = getForge("github");
    expect(a).toBe(b);
  });

  it("has correct display names", () => {
    expect(getForge("github")!.displayName).toBe("GitHub");
    expect(getForge("gitlab")!.displayName).toBe("GitLab");
    expect(getForge("gitea")!.displayName).toBe("Gitea");
    expect(getForge("azure-devops")!.displayName).toBe("Azure DevOps");
    expect(getForge("bitbucket")!.displayName).toBe("Bitbucket");
  });
});

describe("getForgeForRemote", () => {
  it("detects GitHub from HTTPS URL", () => {
    const forge = getForgeForRemote("https://github.com/user/repo.git");
    expect(forge).toBeInstanceOf(GitHubForge);
  });

  it("detects GitHub from SSH URL", () => {
    const forge = getForgeForRemote("git@github.com:user/repo.git");
    expect(forge).toBeInstanceOf(GitHubForge);
  });

  it("detects GitLab", () => {
    const forge = getForgeForRemote("https://gitlab.com/group/project.git");
    expect(forge).toBeInstanceOf(GitLabForge);
  });

  it("detects self-hosted GitLab", () => {
    const forge = getForgeForRemote("https://gitlab.mycompany.com/team/repo.git");
    expect(forge).toBeInstanceOf(GitLabForge);
  });

  it("detects Gitea", () => {
    const forge = getForgeForRemote("https://gitea.example.com/user/repo.git");
    expect(forge).toBeInstanceOf(GiteaForge);
  });

  it("detects Azure DevOps (dev.azure.com)", () => {
    const forge = getForgeForRemote("https://dev.azure.com/org/project/_git/repo");
    expect(forge).toBeInstanceOf(AzureDevOpsForge);
  });

  it("detects Azure DevOps (visualstudio.com)", () => {
    const forge = getForgeForRemote("https://org.visualstudio.com/project/_git/repo");
    expect(forge).toBeInstanceOf(AzureDevOpsForge);
  });

  it("detects Bitbucket", () => {
    const forge = getForgeForRemote("https://bitbucket.org/user/repo.git");
    expect(forge).toBeInstanceOf(BitbucketForge);
  });

  it("returns null for null/empty", () => {
    expect(getForgeForRemote(null)).toBeNull();
    expect(getForgeForRemote("")).toBeNull();
  });
});

describe("forge PR URL builders", () => {
  const ghRemote = { provider: "github" as const, host: "github.com", normalizedUrl: "https://github.com/user/repo", repo: "repo", owner: "user" };
  const glRemote = { provider: "gitlab" as const, host: "gitlab.com", normalizedUrl: "https://gitlab.com/group/repo", repo: "repo", owner: "group" };
  const giteaRemote = { provider: "gitea" as const, host: "gitea.example.com", normalizedUrl: "https://gitea.example.com/user/repo", repo: "repo", owner: "user" };
  const azRemote = { provider: "azure-devops" as const, host: "dev.azure.com", normalizedUrl: "https://dev.azure.com/org/project/_git/repo", repo: "repo", organization: "org", project: "project" };
  const bbRemote = { provider: "bitbucket" as const, host: "bitbucket.org", normalizedUrl: "https://bitbucket.org/user/repo", repo: "repo", owner: "user" };

  it("GitHub PR URL", () => {
    const url = new GitHubForge().buildCreatePrUrl(ghRemote, "feature");
    expect(url).toBe("https://github.com/user/repo/compare/feature?expand=1");
  });

  it("GitLab MR URL", () => {
    const url = new GitLabForge().buildCreatePrUrl(glRemote, "feature");
    expect(url).toBe("https://gitlab.com/group/repo/-/merge_requests/new?merge_request[source_branch]=feature");
  });

  it("Gitea PR URL", () => {
    const url = new GiteaForge().buildCreatePrUrl(giteaRemote, "feature", "main");
    expect(url).toBe("https://gitea.example.com/user/repo/compare/main...feature");
  });

  it("Azure DevOps PR URL", () => {
    const url = new AzureDevOpsForge().buildCreatePrUrl(azRemote, "feature", "main");
    expect(url).toContain("pullrequestcreate");
    expect(url).toContain("sourceRef=");
    expect(url).toContain("targetRef=");
  });

  it("Bitbucket PR URL", () => {
    const url = new BitbucketForge().buildCreatePrUrl(bbRemote, "feature");
    expect(url).toBe("https://bitbucket.org/user/repo/pull-requests/new?source=feature");
  });
});
