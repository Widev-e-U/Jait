/**
 * Git operation REST routes.
 *
 * Exposes server-side git operations so the web frontend can query status,
 * commit, push, and create PRs — mirroring the t3code git flow but via HTTP.
 *
 *   POST   /api/git/status                — get status for a repo path
 *   POST   /api/git/branches              — list branches
 *   POST   /api/git/pull                  — pull (rebase)
 *   POST   /api/git/run-stacked-action    — commit / push / create PR
 *   POST   /api/git/checkout              — checkout a branch
 *   POST   /api/git/init                  — git init
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import { GitService } from "../services/git.js";
import type { WsControlPlane } from "../ws.js";
import { existsSync } from "node:fs";

/**
 * Find a connected remote FsNode that matches a working directory path.
 * Returns the node ID if the cwd doesn't exist locally and a remote node
 * with a matching platform is connected, otherwise null.
 */
function findRemoteNodeForCwd(ws: WsControlPlane | undefined, cwd: string): string | null {
  if (!ws) return null;
  // If the path exists locally, use local git
  if (existsSync(cwd)) return null;
  // Detect path platform from format
  const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(cwd);
  const expectedPlatform = isWindowsPath ? "windows" : null;
  for (const node of ws.getFsNodes()) {
    if (node.isGateway) continue;
    if (expectedPlatform && node.platform !== expectedPlatform) continue;
    return node.id;
  }
  return null;
}

/** Find any connected remote fs node (for gh CLI ops that don't need a cwd). */
function findAnyRemoteNode(ws: WsControlPlane | undefined): string | null {
  if (!ws) return null;
  for (const node of ws.getFsNodes()) {
    if (node.isGateway) continue;
    return node.id;
  }
  return null;
}

export function registerGitRoutes(app: FastifyInstance, config: AppConfig, ws?: WsControlPlane): void {
  const git = new GitService();

  /** Git status for a given cwd */
  app.post("/api/git/status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd, branch, githubToken } = request.body as { cwd: string; branch?: string; githubToken?: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        // Remote: run basic git commands via proxy and build a simplified status
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args }, 30_000);
          return r.stdout.trim();
        };
        let currentBranch: string | null = null;
        try { currentBranch = await gitProxy("rev-parse --abbrev-ref HEAD"); if (currentBranch === "HEAD") currentBranch = null; } catch { /* */ }
        const porcelain = await gitProxy("status --porcelain").catch(() => "");
        const hasChanges = porcelain.length > 0;
        const files: { path: string; insertions: number; deletions: number }[] = [];
        if (hasChanges) {
          try {
            const diffStat = await gitProxy("diff --numstat HEAD").catch(() => gitProxy("diff --numstat"));
            for (const line of diffStat.split("\n").filter(Boolean)) {
              const [ins, del, filePath] = line.split("\t");
              const insertions = ins === "-" ? 0 : parseInt(ins ?? "0", 10);
              const deletions = del === "-" ? 0 : parseInt(del ?? "0", 10);
              if (filePath) files.push({ path: filePath, insertions, deletions });
            }
          } catch { /* */ }
        }
        // Check gh availability on the remote node
        let ghAvailable = false;
        try {
          const ghCheck = await ws.proxyFsOp<{ installed: boolean; authenticated: boolean }>(remoteNodeId, "gh-check", {}, 10_000);
          ghAvailable = ghCheck.installed && ghCheck.authenticated;
        } catch { /* fallback to false */ }
        // Check PR status via remote node's gh cli
        let pr: { number: number; title: string; url: string; baseBranch: string; headBranch: string; state: "open" | "closed" | "merged" } | null = null;
        const prBranch = branch ?? currentBranch;
        if (ghAvailable && prBranch) {
          try {
            const prResult = await ws.proxyFsOp<{ number: number; title: string; url: string; baseBranch: string; headBranch: string; state: "open" | "closed" | "merged" } | null>(
              remoteNodeId, "gh-pr-view", { branch: prBranch, cwd }, 15_000,
            );
            if (prResult) pr = prResult;
          } catch { /* no PR or gh error */ }
        }
        return {
          branch: currentBranch,
          hasWorkingTreeChanges: hasChanges,
          workingTree: { files, insertions: files.reduce((s, f) => s + f.insertions, 0), deletions: files.reduce((s, f) => s + f.deletions, 0) },
          hasUpstream: false,
          aheadCount: 0,
          behindCount: 0,
          pr,
          ghAvailable,
        };
      }
      const status = await git.status(cwd, branch, githubToken);
      return status;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Git status failed" });
    }
  });

  /** List branches */
  app.post("/api/git/branches", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args }, 15_000);
          return r.stdout.trim();
        };
        try { await gitProxy("rev-parse --is-inside-work-tree"); } catch { return { branches: [], isRepo: false }; }
        const raw = await gitProxy("branch -a --format='%(HEAD) %(refname:short)'").catch(() => "");
        const branches: { name: string; isRemote: boolean; current: boolean; isDefault: boolean; worktreePath: string | null }[] = [];
        for (const line of raw.split("\n").filter(Boolean)) {
          const clean = line.replace(/^'|'$/g, "").trim();
          const current = clean.startsWith("*");
          const name = clean.replace(/^\*?\s*/, "").split(/\s+/)[0] ?? "";
          if (!name || name.endsWith("/HEAD")) continue;
          const isRemote = name.includes("/");
          const branchName = isRemote ? name.split("/").slice(1).join("/") : name;
          branches.push({ name: branchName, isRemote, current, isDefault: branchName === "main" || branchName === "master", worktreePath: null });
        }
        return { branches, isRepo: true };
      }
      const result = await git.listBranches(cwd);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to list branches" });
    }
  });

  /** Pull with rebase */
  app.post("/api/git/pull", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args: "pull --rebase" }, 60_000);
        return { ok: true, output: r.stdout.trim() };
      }
      const result = await git.pull(cwd);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Pull failed" });
    }
  });

  /** Run a stacked action: commit, commit_push, or commit_push_pr */
  app.post("/api/git/run-stacked-action", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as Record<string, unknown>;
    const cwd = typeof body["cwd"] === "string" ? body["cwd"] : "";
    const action = typeof body["action"] === "string" ? body["action"] : "";
    const commitMessage = typeof body["commitMessage"] === "string" ? body["commitMessage"] : undefined;
    const featureBranch = body["featureBranch"] === true;
    const baseBranch = typeof body["baseBranch"] === "string" ? body["baseBranch"] : undefined;
    const githubToken = typeof body["githubToken"] === "string" ? body["githubToken"] : undefined;

    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    if (!["commit", "commit_push", "commit_push_pr"].includes(action)) {
      return reply.status(400).send({ error: `Invalid action: ${action}` });
    }

    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        // Proxy to remote node via compound git-stacked-action operation
        const result = await ws.proxyFsOp(remoteNodeId, "git-stacked-action", {
          cwd,
          action,
          commitMessage,
          featureBranch,
          baseBranch,
          githubToken,
        }, 120_000);
        return result;
      }
      const result = await git.runStackedAction(
        cwd,
        action as "commit" | "commit_push" | "commit_push_pr",
        commitMessage,
        featureBranch,
        baseBranch,
        githubToken,
      );
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Action failed" });
    }
  });

  /** Checkout a branch */
  app.post("/api/git/checkout", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; branch?: string };
    if (!body.cwd || !body.branch) {
      return reply.status(400).send({ error: "Missing cwd or branch" });
    }
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.cwd);
      if (remoteNodeId && ws) {
        await ws.proxyFsOp(remoteNodeId, "git", { cwd: body.cwd, args: `checkout "${body.branch}"` }, 15_000);
        return { ok: true };
      }
      await git.checkout(body.cwd, body.branch);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Checkout failed" });
    }
  });

  /** Create a new branch */
  app.post("/api/git/create-branch", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; branch?: string; baseBranch?: string };
    if (!body.cwd || !body.branch) {
      return reply.status(400).send({ error: "Missing cwd or branch" });
    }
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.cwd);
      if (remoteNodeId && ws) {
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd: body.cwd, args }, 15_000);
          return r.stdout.trim();
        };
        if (body.baseBranch) {
          await gitProxy(`checkout "${body.baseBranch}"`);
        }
        await gitProxy(`checkout -b "${body.branch}"`);
        return { ok: true, branch: body.branch };
      }
      // If baseBranch specified, checkout that first
      if (body.baseBranch) {
        await git.checkout(body.cwd, body.baseBranch);
      }
      await git.createBranch(body.cwd, body.branch);
      return { ok: true, branch: body.branch };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Branch creation failed" });
    }
  });

  /** Diff of uncommitted changes */
  app.post("/api/git/diff", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args }, 30_000);
          return r.stdout.trim();
        };
        const staged = await gitProxy("diff --cached").catch(() => "");
        const unstaged = await gitProxy("diff").catch(() => "");
        const diffText = [staged, unstaged].filter(Boolean).join("\n");
        const porcelain = await gitProxy("status --porcelain").catch(() => "");
        const files = porcelain.split("\n").filter(Boolean).map(l => l.slice(3).trim()).filter(Boolean);
        return { diff: diffText, files, hasChanges: files.length > 0 };
      }
      const result = await git.diff(cwd);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Diff failed" });
    }
  });

  /** Per-file original/modified content for Monaco diff editor */
  app.post("/api/git/file-diffs", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; baseBranch?: string };
    if (!body.cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.cwd);
      if (remoteNodeId && ws) {
        // Proxy to remote node via compound git-file-diffs operation
        const files = await ws.proxyFsOp(remoteNodeId, "git-file-diffs", {
          cwd: body.cwd,
          baseBranch: body.baseBranch || undefined,
        }, 60_000);
        return { files };
      }
      const files = await git.fileDiffs(body.cwd, body.baseBranch || undefined);
      return { files };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "File diffs failed" });
    }
  });

  /** Git init */
  app.post("/api/git/init", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      await git.init(cwd);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Git init failed" });
    }
  });

  /** Create a worktree for branch isolation */
  app.post("/api/git/create-worktree", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; baseBranch?: string; newBranch?: string; path?: string };
    if (!body.cwd || !body.baseBranch || !body.newBranch) {
      return reply.status(400).send({ error: "Missing cwd, baseBranch, or newBranch" });
    }
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.cwd);
      if (remoteNodeId && ws) {
        // Proxy worktree creation to the remote node
        const result = await ws.proxyFsOp<{ path: string; branch: string }>(remoteNodeId, "git-create-worktree", {
          cwd: body.cwd,
          baseBranch: body.baseBranch,
          newBranch: body.newBranch,
        }, 60_000);
        return result;
      }
      const result = await git.createWorktree(body.cwd, body.baseBranch, body.newBranch, body.path || undefined);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Worktree creation failed" });
    }
  });

  /** Remove a worktree */
  app.post("/api/git/remove-worktree", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; path?: string; force?: boolean };
    if (!body.cwd || !body.path) {
      return reply.status(400).send({ error: "Missing cwd or path" });
    }
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.path);
      if (remoteNodeId && ws) {
        await ws.proxyFsOp(remoteNodeId, "git-remove-worktree", { path: body.path }, 30_000);
        return { ok: true };
      }
      await git.removeWorktree(body.cwd, body.path, body.force ?? false);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Worktree removal failed" });
    }
  });

  /** Check if GitHub CLI is installed and authenticated */
  app.post("/api/git/gh-status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string };
    const cwd = body.cwd ?? "";

    try {
      const remoteNodeId = cwd ? findRemoteNodeForCwd(ws, cwd) : findAnyRemoteNode(ws);
      if (remoteNodeId && ws) {
        const result = await ws.proxyFsOp<{ installed: boolean; authenticated: boolean; username: string | null }>(
          remoteNodeId, "gh-check", {}, 15_000,
        );
        return result;
      }
      // Local check
      const { exec: execCmd } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execP = promisify(execCmd);
      const { GH_TOKEN: _gt, GITHUB_TOKEN: _ght, ...ghCheckEnv } = process.env;

      let installed = false;
      let authenticated = false;
      let username: string | null = null;

      try {
        await execP("gh --version", { timeout: 5_000 });
        installed = true;
      } catch { /* not installed */ }

      if (installed) {
        try {
          const { stdout, stderr } = await execP("gh auth status", { timeout: 10_000, env: ghCheckEnv });
          const out = (stdout ?? "") + (stderr ?? "");
          if (out.includes("Logged in")) {
            authenticated = true;
            const match = out.match(/Logged in to .+ account (\S+)/);
            if (match?.[1]) username = match[1];
          }
        } catch (err) {
          const msg = err instanceof Error ? (err as { stderr?: string }).stderr ?? err.message : "";
          if (msg.includes("Logged in")) {
            authenticated = true;
            const match = msg.match(/Logged in to .+ account (\S+)/);
            if (match?.[1]) username = match[1];
          }
        }
      }

      return { installed, authenticated, username };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "gh status check failed" });
    }
  });

  /** Authenticate GitHub CLI with a token */
  app.post("/api/git/gh-auth", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; token?: string };
    const cwd = body.cwd ?? "";
    const token = body.token;
    if (!token || typeof token !== "string") {
      return reply.status(400).send({ error: "Missing token" });
    }

    try {
      const remoteNodeId = cwd ? findRemoteNodeForCwd(ws, cwd) : findAnyRemoteNode(ws);
      if (remoteNodeId && ws) {
        const result = await ws.proxyFsOp<{ ok: boolean; username: string | null }>(
          remoteNodeId, "gh-auth-token", { token }, 30_000,
        );
        return result;
      }
      // Local auth
      const { execSync } = await import("node:child_process");
      const { GH_TOKEN: _gt2, GITHUB_TOKEN: _ght2, ...cleanEnv } = process.env;

      execSync("gh auth login --with-token", {
        input: token,
        timeout: 30_000,
        env: cleanEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let username: string | null = null;
      try {
        const out = execSync("gh api user --jq .login", { timeout: 10_000, env: cleanEnv });
        username = out.toString().trim() || null;
      } catch { /* */ }

      return { ok: true, username };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "gh auth failed" });
    }
  });

  app.log.info("Git routes registered at /api/git/*");
}
