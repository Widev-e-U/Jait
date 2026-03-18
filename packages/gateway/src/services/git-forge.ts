/**
 * Generic Git forge abstraction — GitHub, GitLab, Gitea, Azure DevOps, Bitbucket.
 *
 * Each forge implements the same interface so PR creation, auth checks,
 * and status queries work uniformly regardless of hosting provider.
 */

import { exec as execCb } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { parseGitRemote, type GitRemoteProvider, type ParsedRemote } from "./git.js";

const exec = promisify(execCb);

export type { GitRemoteProvider, ParsedRemote };

export interface ForgeAuthResult {
  authenticated: boolean;
  username?: string;
  error?: string;
}

export interface ForgePrInput {
  title: string;
  baseBranch: string;
  headBranch: string;
  body: string;
}

export interface ForgePrResult {
  status: "created" | "opened_existing" | "not_found";
  url?: string;
  number?: number;
  baseBranch?: string;
  headBranch?: string;
  title?: string;
  state?: "open" | "closed" | "merged";
}

export interface ForgePrCheck {
  name: string;
  state: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
  detailsUrl: string;
}

export interface GitForge {
  readonly provider: GitRemoteProvider;
  readonly displayName: string;

  checkCliAvailable(cwd: string): Promise<boolean>;
  checkAuth(cwd: string): Promise<ForgeAuthResult>;
  loginWithToken(token: string, cwd: string): Promise<ForgeAuthResult>;
  resolveToken(cwd: string): Promise<string | null>;
  getDefaultBranch(cwd: string, remote: ParsedRemote): Promise<string | null>;
  findExistingPr(cwd: string, remote: ParsedRemote, headBranch: string, token?: string): Promise<ForgePrResult | null>;
  createPr(cwd: string, remote: ParsedRemote, input: ForgePrInput, token?: string): Promise<ForgePrResult>;
  getPrChecks(cwd: string, headBranch: string): Promise<ForgePrCheck[]>;
  buildCreatePrUrl(remote: ParsedRemote, headBranch: string, baseBranch?: string): string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function cleanGhEnv(): NodeJS.ProcessEnv {
  const { GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
  return rest;
}

async function cliExec(cmd: string, cwd: string, timeout = 30_000, env?: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await exec(cmd, { cwd, timeout, env });
  return stdout.trim();
}

async function cliAvailable(cmd: string, cwd: string): Promise<boolean> {
  try {
    await exec(`${cmd} --version`, { cwd, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function apiHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "jait-gateway",
    ...extra,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  GitHub Forge
// ══════════════════════════════════════════════════════════════════════

export class GitHubForge implements GitForge {
  readonly provider = "github" as const;
  readonly displayName = "GitHub";

  async checkCliAvailable(cwd: string): Promise<boolean> {
    return cliAvailable("gh", cwd);
  }

  async checkAuth(cwd: string): Promise<ForgeAuthResult> {
    try {
      const out = await cliExec("gh auth status", cwd, 10_000, cleanGhEnv());
      const userMatch = out.match(/Logged in to .+ as (\S+)/);
      return { authenticated: true, username: userMatch?.[1] };
    } catch (err) {
      return { authenticated: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async loginWithToken(token: string, cwd: string): Promise<ForgeAuthResult> {
    try {
      const { spawn } = await import("node:child_process");
      await new Promise<void>((resolve, reject) => {
        const child = spawn("gh", ["auth", "login", "--with-token"], {
          cwd, stdio: "pipe", shell: true, env: cleanGhEnv(),
        });
        child.stdin.write(token);
        child.stdin.end();
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`gh auth failed (code ${code})`)));
        child.on("error", reject);
      });
      const username = await cliExec('gh api user --jq ".login"', cwd, 10_000, cleanGhEnv()).catch(() => "");
      return { authenticated: true, username: username || undefined };
    } catch (err) {
      return { authenticated: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async resolveToken(_cwd: string): Promise<string | null> {
    const quick = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_PAT ?? null;
    if (quick) return quick;

    // Try git credential manager
    try {
      const { spawn } = await import("node:child_process");
      return await new Promise<string | null>((resolve) => {
        const proc = spawn("git", ["credential", "fill"], { timeout: 5_000 });
        let out = "";
        proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
        proc.on("close", () => {
          const match = out.match(/^password=(.+)$/m);
          resolve(match?.[1]?.trim() ?? null);
        });
        proc.on("error", () => resolve(null));
        proc.stdin.write("protocol=https\nhost=github.com\n\n");
        proc.stdin.end();
      });
    } catch {
      return null;
    }
  }

  async getDefaultBranch(cwd: string, _remote: ParsedRemote): Promise<string | null> {
    try {
      const json = await cliExec("gh repo view --json defaultBranchRef", cwd, 15_000, cleanGhEnv());
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const ref = parsed.defaultBranchRef as Record<string, unknown> | undefined;
      if (ref?.name) return String(ref.name);
    } catch { /* not available */ }
    return null;
  }

  async findExistingPr(cwd: string, remote: ParsedRemote, headBranch: string, token?: string): Promise<ForgePrResult | null> {
    // Try gh CLI first
    if (await this.checkCliAvailable(cwd)) {
      try {
        const raw = await cliExec(
          `gh pr view --head "${headBranch}" --json number,url,title,state,baseRefName,headRefName`,
          cwd, 15_000, cleanGhEnv(),
        );
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.number) {
          return {
            status: "opened_existing",
            url: String(parsed.url ?? ""),
            number: Number(parsed.number),
            baseBranch: String(parsed.baseRefName ?? ""),
            headBranch: String(parsed.headRefName ?? headBranch),
            title: String(parsed.title ?? ""),
            state: String(parsed.state ?? "OPEN").toLowerCase() === "open" ? "open" : "closed",
          };
        }
      } catch { /* no existing PR */ }
    }

    // Try API
    const effectiveToken = token ?? await this.resolveToken(cwd);
    if (effectiveToken && remote.owner) {
      return this.findPrViaApi(remote, effectiveToken, headBranch);
    }
    return null;
  }

  async createPr(cwd: string, remote: ParsedRemote, input: ForgePrInput, token?: string): Promise<ForgePrResult> {
    // Try gh CLI first
    if (await this.checkCliAvailable(cwd)) {
      return this.createPrViaCli(cwd, input);
    }

    // Fall back to API
    const effectiveToken = token ?? await this.resolveToken(cwd);
    if (effectiveToken && remote.owner) {
      return this.createPrViaApi(remote, effectiveToken, input);
    }

    return { status: "not_found" };
  }

  async getPrChecks(cwd: string, _headBranch: string): Promise<ForgePrCheck[]> {
    if (!await this.checkCliAvailable(cwd)) return [];
    try {
      const raw = await cliExec("gh pr checks --json name,state,conclusion,startedAt,completedAt,detailsUrl", cwd, 15_000, cleanGhEnv());
      return JSON.parse(raw) as ForgePrCheck[];
    } catch {
      return [];
    }
  }

  buildCreatePrUrl(remote: ParsedRemote, headBranch: string, _baseBranch?: string): string | null {
    return `${remote.normalizedUrl}/compare/${encodeURIComponent(headBranch)}?expand=1`;
  }

  private async createPrViaCli(cwd: string, input: ForgePrInput): Promise<ForgePrResult> {
    const bodyFile = join(tmpdir(), `jait-pr-body-${Date.now()}.md`);
    await writeFile(bodyFile, input.body, "utf-8");
    try {
      const baseFlag = input.baseBranch ? ` --base "${input.baseBranch}"` : "";
      const prUrl = await cliExec(
        `gh pr create --title "${input.title.replace(/"/g, '\\"')}" --body-file "${bodyFile}"${baseFlag}`,
        cwd, 60_000, cleanGhEnv(),
      );

      let prNumber = 0;
      let baseBranch = input.baseBranch;
      let headBranch = input.headBranch;
      let title = input.title;
      try {
        const details = await cliExec(
          `gh pr view "${prUrl.trim()}" --json number,title,baseRefName,headRefName`,
          cwd, 15_000, cleanGhEnv(),
        );
        const p = JSON.parse(details) as Record<string, unknown>;
        prNumber = Number(p.number ?? 0);
        baseBranch = String(p.baseRefName ?? baseBranch);
        headBranch = String(p.headRefName ?? headBranch);
        title = String(p.title ?? title);
      } catch { /* best effort */ }

      return { status: "created", url: prUrl.trim(), number: prNumber, baseBranch, headBranch, title };
    } finally {
      await unlink(bodyFile).catch(() => {});
    }
  }

  private async createPrViaApi(
    remote: ParsedRemote,
    token: string,
    input: ForgePrInput,
  ): Promise<ForgePrResult> {
    const apiBase = remote.host === "github.com" ? "https://api.github.com" : `https://${remote.host}/api/v3`;
    const headers = { ...apiHeaders(token), Accept: "application/vnd.github+json", "Content-Type": "application/json" };
    const headParam = `${remote.owner}:${input.headBranch}`;

    const res = await fetch(`${apiBase}/repos/${remote.owner}/${remote.repo}/pulls`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: input.title, head: headParam, base: input.baseBranch, body: input.body }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API PR create failed (${res.status}): ${text.slice(0, 400)}`);
    }

    const json = await res.json() as Record<string, unknown>;
    return {
      status: "created",
      url: String(json.html_url ?? ""),
      number: Number(json.number ?? 0),
      baseBranch: String((json.base as { ref?: string } | undefined)?.ref ?? input.baseBranch),
      headBranch: String((json.head as { ref?: string } | undefined)?.ref ?? input.headBranch),
      title: String(json.title ?? input.title),
    };
  }

  private async findPrViaApi(remote: ParsedRemote, token: string, headBranch: string): Promise<ForgePrResult | null> {
    const apiBase = remote.host === "github.com" ? "https://api.github.com" : `https://${remote.host}/api/v3`;
    const headers = apiHeaders(token, { Accept: "application/vnd.github+json" });
    const headParam = `${remote.owner}:${headBranch}`;

    try {
      const res = await fetch(`${apiBase}/repos/${remote.owner}/${remote.repo}/pulls?head=${encodeURIComponent(headParam)}&state=all`, { headers });
      if (!res.ok) return null;
      const list = await res.json() as Array<Record<string, unknown>>;
      const pr = (list.find((p) => p?.state === "open") ?? list[0]) as Record<string, unknown> | undefined;
      if (!pr?.html_url) return null;
      const merged = pr.merged_at != null;
      return {
        status: "opened_existing",
        url: String(pr.html_url),
        number: Number(pr.number ?? 0),
        baseBranch: String((pr.base as { ref?: string } | undefined)?.ref ?? ""),
        headBranch: String((pr.head as { ref?: string } | undefined)?.ref ?? headBranch),
        title: String(pr.title ?? ""),
        state: merged ? "merged" : String(pr.state ?? "open") === "closed" ? "closed" : "open",
      };
    } catch {
      return null;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  GitLab Forge
// ══════════════════════════════════════════════════════════════════════

export class GitLabForge implements GitForge {
  readonly provider = "gitlab" as const;
  readonly displayName = "GitLab";

  async checkCliAvailable(cwd: string): Promise<boolean> {
    return cliAvailable("glab", cwd);
  }

  async checkAuth(cwd: string): Promise<ForgeAuthResult> {
    try {
      const out = await cliExec("glab auth status", cwd, 10_000);
      const userMatch = out.match(/Logged in .+ as (\S+)/i);
      return { authenticated: true, username: userMatch?.[1] };
    } catch {
      const token = await this.resolveToken(cwd);
      return token ? { authenticated: true } : { authenticated: false, error: "glab CLI not authenticated and no GITLAB_TOKEN set" };
    }
  }

  async loginWithToken(token: string, cwd: string): Promise<ForgeAuthResult> {
    try {
      await cliExec(`glab auth login --token "${token}"`, cwd, 15_000);
      return { authenticated: true };
    } catch (err) {
      return { authenticated: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async resolveToken(_cwd: string): Promise<string | null> {
    return process.env.GITLAB_TOKEN ?? process.env.GITLAB_PAT ?? null;
  }

  async getDefaultBranch(_cwd: string, remote: ParsedRemote): Promise<string | null> {
    const token = await this.resolveToken(_cwd);
    if (!token) return null;
    const apiBase = `https://${remote.host}/api/v4`;
    const projectPath = remote.owner ? `${remote.owner}/${remote.repo}` : remote.repo;
    try {
      const res = await fetch(`${apiBase}/projects/${encodeURIComponent(projectPath)}`, {
        headers: apiHeaders(token),
      });
      if (!res.ok) return null;
      const json = await res.json() as Record<string, unknown>;
      return String(json.default_branch ?? "main");
    } catch {
      return null;
    }
  }

  async findExistingPr(_cwd: string, remote: ParsedRemote, headBranch: string, token?: string): Promise<ForgePrResult | null> {
    const effectiveToken = token ?? await this.resolveToken(_cwd);
    if (!effectiveToken) return null;

    const apiBase = `https://${remote.host}/api/v4`;
    const projectPath = remote.owner ? `${remote.owner}/${remote.repo}` : remote.repo;
    try {
      const res = await fetch(
        `${apiBase}/projects/${encodeURIComponent(projectPath)}/merge_requests?source_branch=${encodeURIComponent(headBranch)}&state=opened`,
        { headers: apiHeaders(effectiveToken) },
      );
      if (!res.ok) return null;
      const list = await res.json() as Array<Record<string, unknown>>;
      const mr = list[0];
      if (!mr) return null;
      return {
        status: "opened_existing",
        url: String(mr.web_url ?? ""),
        number: Number(mr.iid ?? 0),
        baseBranch: String(mr.target_branch ?? ""),
        headBranch: String(mr.source_branch ?? headBranch),
        title: String(mr.title ?? ""),
        state: "open",
      };
    } catch {
      return null;
    }
  }

  async createPr(_cwd: string, remote: ParsedRemote, input: ForgePrInput, token?: string): Promise<ForgePrResult> {
    const effectiveToken = token ?? await this.resolveToken(_cwd);
    if (!effectiveToken) return { status: "not_found" };

    const apiBase = `https://${remote.host}/api/v4`;
    const projectPath = remote.owner ? `${remote.owner}/${remote.repo}` : remote.repo;

    const res = await fetch(
      `${apiBase}/projects/${encodeURIComponent(projectPath)}/merge_requests`,
      {
        method: "POST",
        headers: { ...apiHeaders(effectiveToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          source_branch: input.headBranch,
          target_branch: input.baseBranch,
          description: input.body,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitLab API MR create failed (${res.status}): ${text.slice(0, 400)}`);
    }

    const json = await res.json() as Record<string, unknown>;
    return {
      status: "created",
      url: String(json.web_url ?? ""),
      number: Number(json.iid ?? 0),
      baseBranch: String(json.target_branch ?? input.baseBranch),
      headBranch: String(json.source_branch ?? input.headBranch),
      title: String(json.title ?? input.title),
    };
  }

  async getPrChecks(_cwd: string, _headBranch: string): Promise<ForgePrCheck[]> {
    return [];
  }

  buildCreatePrUrl(remote: ParsedRemote, headBranch: string, _baseBranch?: string): string | null {
    return `${remote.normalizedUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(headBranch)}`;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Gitea Forge (also covers Forgejo)
// ══════════════════════════════════════════════════════════════════════

export class GiteaForge implements GitForge {
  readonly provider = "gitea" as const;
  readonly displayName = "Gitea";

  async checkCliAvailable(cwd: string): Promise<boolean> {
    return cliAvailable("tea", cwd);
  }

  async checkAuth(_cwd: string): Promise<ForgeAuthResult> {
    const token = await this.resolveToken(_cwd);
    return token
      ? { authenticated: true }
      : { authenticated: false, error: "No GITEA_TOKEN set. Configure it in Settings → API." };
  }

  async loginWithToken(_token: string, _cwd: string): Promise<ForgeAuthResult> {
    return { authenticated: true };
  }

  async resolveToken(_cwd: string): Promise<string | null> {
    return process.env.GITEA_TOKEN ?? process.env.GITEA_PAT ?? null;
  }

  async getDefaultBranch(_cwd: string, remote: ParsedRemote): Promise<string | null> {
    const token = await this.resolveToken(_cwd);
    if (!token || !remote.owner) return null;
    try {
      const res = await fetch(`https://${remote.host}/api/v1/repos/${remote.owner}/${remote.repo}`, {
        headers: apiHeaders(token),
      });
      if (!res.ok) return null;
      const json = await res.json() as Record<string, unknown>;
      return String(json.default_branch ?? "main");
    } catch {
      return null;
    }
  }

  async findExistingPr(_cwd: string, remote: ParsedRemote, headBranch: string, token?: string): Promise<ForgePrResult | null> {
    const effectiveToken = token ?? await this.resolveToken(_cwd);
    if (!effectiveToken || !remote.owner) return null;

    try {
      const res = await fetch(
        `https://${remote.host}/api/v1/repos/${remote.owner}/${remote.repo}/pulls?state=open&head=${encodeURIComponent(`${remote.owner}:${headBranch}`)}`,
        { headers: apiHeaders(effectiveToken) },
      );
      if (!res.ok) return null;
      const list = await res.json() as Array<Record<string, unknown>>;
      const pr = list[0];
      if (!pr) return null;
      return {
        status: "opened_existing",
        url: String(pr.html_url ?? ""),
        number: Number(pr.number ?? 0),
        baseBranch: String((pr.base as { label?: string } | undefined)?.label ?? ""),
        headBranch: String((pr.head as { label?: string } | undefined)?.label ?? headBranch),
        title: String(pr.title ?? ""),
        state: "open",
      };
    } catch {
      return null;
    }
  }

  async createPr(_cwd: string, remote: ParsedRemote, input: ForgePrInput, token?: string): Promise<ForgePrResult> {
    const effectiveToken = token ?? await this.resolveToken(_cwd);
    if (!effectiveToken || !remote.owner) return { status: "not_found" };

    const res = await fetch(
      `https://${remote.host}/api/v1/repos/${remote.owner}/${remote.repo}/pulls`,
      {
        method: "POST",
        headers: { ...apiHeaders(effectiveToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          head: input.headBranch,
          base: input.baseBranch,
          body: input.body,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gitea API PR create failed (${res.status}): ${text.slice(0, 400)}`);
    }

    const json = await res.json() as Record<string, unknown>;
    return {
      status: "created",
      url: String(json.html_url ?? ""),
      number: Number(json.number ?? 0),
      baseBranch: String((json.base as { label?: string } | undefined)?.label ?? input.baseBranch),
      headBranch: String((json.head as { label?: string } | undefined)?.label ?? input.headBranch),
      title: String(json.title ?? input.title),
    };
  }

  async getPrChecks(_cwd: string, _headBranch: string): Promise<ForgePrCheck[]> {
    return [];
  }

  buildCreatePrUrl(remote: ParsedRemote, headBranch: string, baseBranch?: string): string | null {
    return `${remote.normalizedUrl}/compare/${encodeURIComponent(baseBranch ?? "main")}...${encodeURIComponent(headBranch)}`;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Azure DevOps Forge
// ══════════════════════════════════════════════════════════════════════

export class AzureDevOpsForge implements GitForge {
  readonly provider = "azure-devops" as const;
  readonly displayName = "Azure DevOps";

  async checkCliAvailable(cwd: string): Promise<boolean> {
    return cliAvailable("az", cwd);
  }

  async checkAuth(cwd: string): Promise<ForgeAuthResult> {
    try {
      const out = await cliExec("az account show --query user.name -o tsv", cwd, 10_000);
      return { authenticated: true, username: out || undefined };
    } catch {
      const token = await this.resolveToken(cwd);
      return token
        ? { authenticated: true }
        : { authenticated: false, error: "Azure CLI not authenticated and no AZURE_DEVOPS_PAT set" };
    }
  }

  async loginWithToken(_token: string, _cwd: string): Promise<ForgeAuthResult> {
    return { authenticated: true };
  }

  async resolveToken(_cwd: string): Promise<string | null> {
    return process.env.AZURE_DEVOPS_PAT ?? process.env.AZURE_DEVOPS_TOKEN ?? null;
  }

  async getDefaultBranch(_cwd: string, _remote: ParsedRemote): Promise<string | null> {
    return null;
  }

  async findExistingPr(cwd: string, remote: ParsedRemote, headBranch: string, _token?: string): Promise<ForgePrResult | null> {
    if (!await this.checkCliAvailable(cwd)) return null;
    const orgUrl = this.buildOrgUrl(remote);

    try {
      const raw = await cliExec(
        `az repos pr list --organization "${orgUrl}" --project "${remote.project}" --repository "${remote.repo}" --source-branch "${headBranch}" --status active --output json`,
        cwd, 30_000,
      );
      const list = JSON.parse(raw) as Array<Record<string, unknown>>;
      const first = list[0];
      if (!first) return null;
      const prId = Number(first.pullRequestId ?? 0);
      return {
        status: "opened_existing",
        url: this.buildPrUrl(remote, prId),
        number: prId,
        baseBranch: String(first.targetRefName ?? "").replace(/^refs\/heads\//, ""),
        headBranch: String(first.sourceRefName ?? headBranch).replace(/^refs\/heads\//, ""),
        title: String(first.title ?? ""),
        state: "open",
      };
    } catch {
      return null;
    }
  }

  async createPr(cwd: string, remote: ParsedRemote, input: ForgePrInput, _token?: string): Promise<ForgePrResult> {
    if (!await this.checkCliAvailable(cwd)) return { status: "not_found" };

    const orgUrl = this.buildOrgUrl(remote);
    const bodyFile = join(tmpdir(), `jait-az-pr-body-${Date.now()}.md`);
    await writeFile(bodyFile, input.body, "utf-8");

    try {
      const raw = await cliExec(
        `az repos pr create --organization "${orgUrl}" --project "${remote.project}" --repository "${remote.repo}" --source-branch "${input.headBranch}" --target-branch "${input.baseBranch}" --title "${input.title.replace(/"/g, '\\"')}" --description @"${bodyFile}" --output json`,
        cwd, 60_000,
      );
      const created = JSON.parse(raw) as Record<string, unknown>;
      const prId = Number(created.pullRequestId ?? 0);
      return {
        status: "created",
        url: this.buildPrUrl(remote, prId),
        number: prId,
        baseBranch: String(created.targetRefName ?? input.baseBranch).replace(/^refs\/heads\//, ""),
        headBranch: String(created.sourceRefName ?? input.headBranch).replace(/^refs\/heads\//, ""),
        title: String(created.title ?? input.title),
      };
    } finally {
      await unlink(bodyFile).catch(() => {});
    }
  }

  async getPrChecks(_cwd: string, _headBranch: string): Promise<ForgePrCheck[]> {
    return [];
  }

  buildCreatePrUrl(remote: ParsedRemote, headBranch: string, baseBranch?: string): string | null {
    const base = this.buildRepoUrl(remote);
    return `${base}/pullrequestcreate?sourceRef=${encodeURIComponent(`refs/heads/${headBranch}`)}${baseBranch ? `&targetRef=${encodeURIComponent(`refs/heads/${baseBranch}`)}` : ""}`;
  }

  private buildOrgUrl(remote: ParsedRemote): string {
    return remote.host === "dev.azure.com"
      ? `https://dev.azure.com/${remote.organization}`
      : `https://${remote.host}`;
  }

  private buildRepoUrl(remote: ParsedRemote): string {
    return remote.host === "dev.azure.com"
      ? `https://dev.azure.com/${remote.organization}/${remote.project}/_git/${remote.repo}`
      : `https://${remote.host}/${remote.project}/_git/${remote.repo}`;
  }

  private buildPrUrl(remote: ParsedRemote, prId: number): string {
    return `${this.buildRepoUrl(remote)}/pullrequest/${prId}`;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Bitbucket Forge
// ══════════════════════════════════════════════════════════════════════

export class BitbucketForge implements GitForge {
  readonly provider = "bitbucket" as const;
  readonly displayName = "Bitbucket";

  async checkCliAvailable(_cwd: string): Promise<boolean> {
    return false;
  }

  async checkAuth(_cwd: string): Promise<ForgeAuthResult> {
    const token = await this.resolveToken(_cwd);
    return token
      ? { authenticated: true }
      : { authenticated: false, error: "No BITBUCKET_TOKEN set. Configure it in Settings → API." };
  }

  async loginWithToken(_token: string, _cwd: string): Promise<ForgeAuthResult> {
    return { authenticated: true };
  }

  async resolveToken(_cwd: string): Promise<string | null> {
    return process.env.BITBUCKET_TOKEN ?? process.env.BITBUCKET_APP_PASSWORD ?? null;
  }

  async getDefaultBranch(_cwd: string, remote: ParsedRemote): Promise<string | null> {
    const token = await this.resolveToken(_cwd);
    if (!token || !remote.owner) return null;
    try {
      const res = await fetch(`https://api.bitbucket.org/2.0/repositories/${remote.owner}/${remote.repo}`, {
        headers: apiHeaders(token),
      });
      if (!res.ok) return null;
      const json = await res.json() as { mainbranch?: { name?: string } };
      return json.mainbranch?.name ?? null;
    } catch {
      return null;
    }
  }

  async findExistingPr(_cwd: string, remote: ParsedRemote, headBranch: string, token?: string): Promise<ForgePrResult | null> {
    const effectiveToken = token ?? await this.resolveToken(_cwd);
    if (!effectiveToken || !remote.owner) return null;

    try {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${remote.owner}/${remote.repo}/pullrequests?q=source.branch.name="${encodeURIComponent(headBranch)}"&state=OPEN`,
        { headers: apiHeaders(effectiveToken) },
      );
      if (!res.ok) return null;
      const data = await res.json() as { values?: Array<Record<string, unknown>> };
      const pr = data.values?.[0];
      if (!pr) return null;
      return {
        status: "opened_existing",
        url: String((pr.links as Record<string, { href?: string }> | undefined)?.html?.href ?? ""),
        number: Number(pr.id ?? 0),
        baseBranch: String((pr.destination as { branch?: { name?: string } } | undefined)?.branch?.name ?? ""),
        headBranch: String((pr.source as { branch?: { name?: string } } | undefined)?.branch?.name ?? headBranch),
        title: String(pr.title ?? ""),
        state: "open",
      };
    } catch {
      return null;
    }
  }

  async createPr(_cwd: string, remote: ParsedRemote, input: ForgePrInput, token?: string): Promise<ForgePrResult> {
    const effectiveToken = token ?? await this.resolveToken(_cwd);
    if (!effectiveToken || !remote.owner) return { status: "not_found" };

    const res = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${remote.owner}/${remote.repo}/pullrequests`,
      {
        method: "POST",
        headers: { ...apiHeaders(effectiveToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          source: { branch: { name: input.headBranch } },
          destination: { branch: { name: input.baseBranch } },
          description: input.body,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Bitbucket API PR create failed (${res.status}): ${text.slice(0, 400)}`);
    }

    const json = await res.json() as Record<string, unknown>;
    return {
      status: "created",
      url: String((json.links as Record<string, { href?: string }> | undefined)?.html?.href ?? ""),
      number: Number(json.id ?? 0),
      baseBranch: String((json.destination as { branch?: { name?: string } } | undefined)?.branch?.name ?? input.baseBranch),
      headBranch: String((json.source as { branch?: { name?: string } } | undefined)?.branch?.name ?? input.headBranch),
      title: String(json.title ?? input.title),
    };
  }

  async getPrChecks(_cwd: string, _headBranch: string): Promise<ForgePrCheck[]> {
    return [];
  }

  buildCreatePrUrl(remote: ParsedRemote, headBranch: string, _baseBranch?: string): string | null {
    return `${remote.normalizedUrl}/pull-requests/new?source=${encodeURIComponent(headBranch)}`;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Forge Factory
// ══════════════════════════════════════════════════════════════════════

const FORGE_MAP: Record<string, () => GitForge> = {
  github: () => new GitHubForge(),
  gitlab: () => new GitLabForge(),
  gitea: () => new GiteaForge(),
  "azure-devops": () => new AzureDevOpsForge(),
  bitbucket: () => new BitbucketForge(),
};

let _forgeCache = new Map<string, GitForge>();

export function getForge(provider: GitRemoteProvider): GitForge | null {
  if (provider === "unknown" || provider === "none") return null;
  const cached = _forgeCache.get(provider);
  if (cached) return cached;
  const factory = FORGE_MAP[provider];
  if (!factory) return null;
  const forge = factory();
  _forgeCache.set(provider, forge);
  return forge;
}

export function getForgeForRemote(remoteUrl: string | null): GitForge | null {
  if (!remoteUrl) return null;
  const parsed = parseGitRemote(remoteUrl);
  if (!parsed) return null;
  return getForge(parsed.provider);
}
