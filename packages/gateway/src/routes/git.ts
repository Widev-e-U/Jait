/**
 * Git operation REST routes.
 *
 * Exposes server-side git operations so the web frontend can query status,
 * commit, push, and create PRs — mirroring the t3code git flow but via HTTP.
 *
 *   POST   /api/git/status                — get status for a repo path
 *   POST   /api/git/branches              — list branches
 *   POST   /api/git/fetch                 — fetch remote refs
 *   POST   /api/git/pull                  — pull (rebase)
 *   POST   /api/git/run-stacked-action    — commit / push / create PR
 *   POST   /api/git/checkout              — checkout a branch
 *   POST   /api/git/init                  — git init
 *   POST   /api/git/identity              — get/set local git author identity
 */

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import { GitService, detectGitRemoteProvider, parseGitRemote } from "../services/git.js";
import { getForge } from "../services/git-forge.js";
import type { WsControlPlane } from "../ws.js";
import { existsSync } from "node:fs";
import type { UserService } from "../services/users.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ProviderId, CliProviderAdapter, ProviderEvent } from "../providers/contracts.js";
import { RemoteCliProvider } from "../providers/remote-cli-provider.js";

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

interface GitRouteDeps {
  ws?: WsControlPlane;
  userService?: UserService;
  providerRegistry?: ProviderRegistry;
}

function normalizeGitRouteDeps(deps?: WsControlPlane | GitRouteDeps): GitRouteDeps {
  if (!deps) return {};
  if (typeof (deps as WsControlPlane).getFsNodes === "function") return { ws: deps as WsControlPlane };
  return deps as GitRouteDeps;
}

async function generateCommitMessageWithCliProvider(
  provider: CliProviderAdapter,
  cwd: string,
  prompt: string,
  model?: string,
): Promise<string> {
  const session = await provider.startSession({
    threadId: `git-commit-${randomUUID()}`,
    workingDirectory: cwd,
    mode: "full-access",
    ...(model ? { model } : {}),
  });

  let tokenContent = "";
  let messageContent = "";
  let sessionError: string | null = null;
  let turnCompleted = false;

  let resolveTurn: (() => void) | null = null;
  let rejectTurn: ((error: Error) => void) | null = null;

  const waitForTurn = new Promise<void>((resolve, reject) => {
    resolveTurn = resolve;
    rejectTurn = reject;
  });

  const unsubscribe = provider.onEvent((event: ProviderEvent) => {
    if (event.sessionId !== session.id) return;
    if (event.type === "token") tokenContent += event.content;
    if (event.type === "message" && event.role === "assistant") {
      messageContent += event.content;
    }
    if (event.type === "session.error") {
      sessionError = event.error;
      rejectTurn?.(new Error(event.error));
      return;
    }
    if (event.type === "turn.completed" || event.type === "session.completed") {
      turnCompleted = true;
      resolveTurn?.();
    }
  });

  try {
    await provider.sendTurn(session.id, prompt);
    await Promise.race([
      waitForTurn,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for CLI provider response")), 60_000);
      }),
    ]);
    if (sessionError) throw new Error(sessionError);
    if (!turnCompleted && !sessionError) {
      throw new Error("CLI provider turn did not complete");
    }
    return (tokenContent || messageContent).trim();
  } finally {
    unsubscribe();
    try { await provider.stopSession(session.id); } catch { /* best effort */ }
  }
}

export function registerGitRoutes(app: FastifyInstance, config: AppConfig, deps?: WsControlPlane | GitRouteDeps): void {
  const git = new GitService();
  const { ws, userService, providerRegistry } = normalizeGitRouteDeps(deps);

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
        // Build per-file status map from porcelain
        const statusMap = new Map<string, string>();
        for (const pLine of porcelain.split("\n").filter(Boolean)) {
          const xy = pLine.slice(0, 2);
          let fp = pLine.slice(3).trim();
          if (fp.includes(" -> ")) fp = fp.split(" -> ").pop()!.trim();
          let st = "M";
          if (xy.includes("?")) st = "?";
          else if (xy.includes("A")) st = "A";
          else if (xy.includes("D")) st = "D";
          else if (xy.includes("R")) st = "R";
          if (fp) statusMap.set(fp, st);
        }
        const files: { path: string; insertions: number; deletions: number; status: string }[] = [];
        if (hasChanges) {
          try {
            const diffStat = await gitProxy("diff --numstat HEAD").catch(() => gitProxy("diff --numstat"));
            for (const line of diffStat.split("\n").filter(Boolean)) {
              const [ins, del, filePath] = line.split("\t");
              const insertions = ins === "-" ? 0 : parseInt(ins ?? "0", 10);
              const deletions = del === "-" ? 0 : parseInt(del ?? "0", 10);
              if (filePath) files.push({ path: filePath, insertions, deletions, status: statusMap.get(filePath) ?? "M" });
            }
            // Also count untracked files
            for (const [fp, st] of statusMap) {
              if (st === "?" && !files.some((f) => f.path === fp)) {
                files.push({ path: fp, insertions: 0, deletions: 0, status: "?" });
              }
            }
          } catch { /* */ }
        }
        // Check gh availability on the remote node
        let ghAvailable = false;
        try {
          const ghCheck = await ws.proxyFsOp<{ installed: boolean; authenticated: boolean }>(remoteNodeId, "gh-check", {}, 10_000);
          ghAvailable = ghCheck.installed && ghCheck.authenticated;
        } catch { /* fallback to false */ }
        let remoteUrl: string | null = null;
        try {
          const preferredRemote = await gitProxy("remote").then((out) => out.split("\n").map((line) => line.trim()).find(Boolean) ?? "origin");
          remoteUrl = await gitProxy(`remote get-url ${preferredRemote}`).catch(() => null as string | null);
        } catch { /* ignore */ }
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
          prProvider: detectGitRemoteProvider(remoteUrl),
          remoteUrl,
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

  /** Fetch remote refs */
  app.post("/api/git/fetch", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd, all } = request.body as { cwd: string; all?: boolean };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        const remotes = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args: "remote" }, 15_000)
          .then((r) => r.stdout.split("\n").map((line) => line.trim()).filter(Boolean))
          .catch(() => []);
        if (!all && remotes.length === 0) {
          return { status: "skipped_no_remote", remote: null, allRemotes: false };
        }
        const preferredRemote = remotes[0] ?? null;
        const args = all ? "fetch --all" : `fetch "${preferredRemote}"`;
        await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args }, 60_000);
        return {
          status: "fetched",
          remote: preferredRemote,
          allRemotes: all === true,
        };
      }
      const result = await git.fetch(cwd, all === true);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Fetch failed" });
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

  /** Get or set repo-local git author identity */
  app.post("/api/git/identity", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as Record<string, unknown>;
    const cwd = typeof body["cwd"] === "string" ? body["cwd"] : "";
    const name = typeof body["name"] === "string" ? body["name"].trim() : undefined;
    const email = typeof body["email"] === "string" ? body["email"].trim() : undefined;

    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });

    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        const readConfig = async (key: string) => {
          try {
            const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args: `config --get ${key}` }, 15_000);
            return r.stdout.trim() || null;
          } catch {
            return null;
          }
        };

        if (name || email) {
          if (!name || !email) {
            return reply.status(400).send({ error: "Both name and email are required" });
          }
          await ws.proxyFsOp(remoteNodeId, "git", { cwd, args: `config user.name "${name.replace(/"/g, '\\"')}"` }, 15_000);
          await ws.proxyFsOp(remoteNodeId, "git", { cwd, args: `config user.email "${email.replace(/"/g, '\\"')}"` }, 15_000);
        }

        return {
          name: await readConfig("user.name"),
          email: await readConfig("user.email"),
        };
      }

      if (name || email) {
        if (!name || !email) {
          return reply.status(400).send({ error: "Both name and email are required" });
        }
        return await git.setIdentity(cwd, name, email);
      }

      return await git.getIdentity(cwd);
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Git identity request failed" });
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

  /** Discard changes for specific files or all changes */
  app.post("/api/git/discard", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; paths?: string[] };
    if (!body.cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.cwd);
      if (remoteNodeId && ws) {
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd: body.cwd, args }, 30_000);
          return r.stdout.trim();
        };
        if (!body.paths?.length) {
          await gitProxy("checkout -- .").catch(() => "");
          await gitProxy("clean -fd").catch(() => "");
          return { ok: true, discardedCount: -1 };
        }
        let count = 0;
        for (const p of body.paths) {
          if (/[;&|`$]/.test(p)) continue;
          try { await gitProxy(`checkout -- "${p}"`); count++; } catch {
            try { await gitProxy(`clean -fd -- "${p}"`); count++; } catch { /* skip */ }
          }
        }
        return { ok: true, discardedCount: count };
      }
      const result = await git.discardChanges(body.cwd, body.paths);
      return { ok: true, ...result };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Discard failed" });
    }
  });

  /** Stage files (git add) */
  app.post("/api/git/stage", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; paths?: string[] };
    if (!body.cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.cwd);
      if (remoteNodeId && ws) {
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd: body.cwd, args }, 15_000);
          return r.stdout.trim();
        };
        if (!body.paths?.length) {
          await gitProxy("add -A");
        } else {
          for (const p of body.paths) {
            if (/[;&|`$]/.test(p)) continue;
            await gitProxy(`add "${p}"`);
          }
        }
        return { ok: true };
      }
      await git.stage(body.cwd, body.paths);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Stage failed" });
    }
  });

  /** Unstage files (git reset) */
  app.post("/api/git/unstage", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; paths?: string[] };
    if (!body.cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const remoteNodeId = findRemoteNodeForCwd(ws, body.cwd);
      if (remoteNodeId && ws) {
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd: body.cwd, args }, 15_000);
          return r.stdout.trim();
        };
        if (!body.paths?.length) {
          await gitProxy("reset HEAD");
        } else {
          for (const p of body.paths) {
            if (/[;&|`$]/.test(p)) continue;
            await gitProxy(`reset HEAD -- "${p}"`);
          }
        }
        return { ok: true };
      }
      await git.unstage(body.cwd, body.paths);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Unstage failed" });
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

  /** Fetch CI check statuses for a PR branch */
  app.post("/api/git/pr-checks", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; branch?: string };
    const cwd = body.cwd ?? "";
    const branch = body.branch;
    if (!branch || typeof branch !== "string") {
      return reply.status(400).send({ error: "Missing branch parameter" });
    }

    try {
      const remoteNodeId = cwd ? findRemoteNodeForCwd(ws, cwd) : findAnyRemoteNode(ws);
      if (remoteNodeId && ws) {
        const result = await ws.proxyFsOp<unknown[]>(
          remoteNodeId, "gh-pr-checks", { cwd, branch }, 15_000,
        );
        return result;
      }
      // Local check
      return await git.prChecks(cwd, branch);
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "pr checks failed" });
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

  // ── Generic forge endpoints (provider-agnostic) ───────────────────

  /** Check forge auth status — auto-detects provider from remote URL */
  app.post("/api/git/forge-status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; remoteUrl?: string };
    const cwd = body.cwd ?? "";

    try {
      const remoteUrl = body.remoteUrl ?? (cwd ? await git.getRemoteUrl(cwd, "origin").catch(() => null) : null);
      const parsed = parseGitRemote(remoteUrl ?? null);
      const provider = parsed?.provider ?? "unknown";
      const forge = getForge(provider);

      if (!forge) {
        return {
          provider,
          forgeName: provider === "unknown" ? "Unknown" : provider,
          installed: false,
          authenticated: false,
          username: null,
        };
      }

      const installed = await forge.checkCliAvailable(cwd || process.cwd());
      const authResult = await forge.checkAuth(cwd || process.cwd());

      return {
        provider,
        forgeName: forge.displayName,
        installed,
        authenticated: authResult.authenticated,
        username: authResult.username ?? null,
        error: authResult.error,
      };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "forge status check failed" });
    }
  });

  /** Authenticate with a forge — auto-detects provider */
  app.post("/api/git/forge-auth", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; token?: string; remoteUrl?: string };
    const cwd = body.cwd ?? "";
    const token = body.token;
    if (!token || typeof token !== "string") {
      return reply.status(400).send({ error: "Missing token" });
    }

    try {
      const remoteUrl = body.remoteUrl ?? (cwd ? await git.getRemoteUrl(cwd, "origin").catch(() => null) : null);
      const parsed = parseGitRemote(remoteUrl ?? null);
      const forge = parsed ? getForge(parsed.provider) : null;

      if (!forge) {
        return reply.status(400).send({ error: "Cannot determine forge provider from remote URL" });
      }

      const result = await forge.loginWithToken(token, cwd || process.cwd());
      return { ok: result.authenticated, username: result.username ?? null, error: result.error };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "forge auth failed" });
    }
  });

  /** Fetch PR checks — auto-detects provider */
  app.post("/api/git/forge-pr-checks", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; branch?: string; remoteUrl?: string };
    const cwd = body.cwd ?? "";
    const branch = body.branch;
    if (!branch) {
      return reply.status(400).send({ error: "Missing branch parameter" });
    }

    try {
      const remoteUrl = body.remoteUrl ?? (cwd ? await git.getRemoteUrl(cwd, "origin").catch(() => null) : null);
      const parsed = parseGitRemote(remoteUrl ?? null);
      const forge = parsed ? getForge(parsed.provider) : null;
      if (!forge) return [];

      return await forge.getPrChecks(cwd || process.cwd(), branch);
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "forge pr checks failed" });
    }
  });

  /** Generate a commit message from current changes using AI */
  app.post("/api/git/generate-commit-message", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd, provider, model } = request.body as { cwd?: string; provider?: ProviderId; model?: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });

    try {
      // Get the current diff text
      let diffText = "";
      const remoteNodeId = findRemoteNodeForCwd(ws, cwd);
      if (remoteNodeId && ws) {
        const gitProxy = async (args: string) => {
          const r = await ws.proxyFsOp<{ stdout: string }>(remoteNodeId, "git", { cwd, args }, 30_000);
          return r.stdout.trim();
        };
        const staged = await gitProxy("diff --cached").catch(() => "");
        const unstaged = await gitProxy("diff HEAD").catch(() => "");
        diffText = [staged, unstaged].filter(Boolean).join("\n");
      } else {
        const result = await git.diff(cwd);
        diffText = result.diff;
      }

      if (!diffText) {
        return reply.status(400).send({ error: "No changes to generate a commit message for" });
      }

      // Truncate diff to stay within token limits (~8 KB is plenty for a commit message)
      const MAX_DIFF_CHARS = 8000;
      if (diffText.length > MAX_DIFF_CHARS) {
        diffText = diffText.slice(0, MAX_DIFF_CHARS) + "\n... (truncated)";
      }

      const prompt =
        "Generate a concise git commit message in the imperative mood. " +
        "Subject line must be 72 characters or less. " +
        "Optionally follow with a blank line and brief bullet points for significant details. " +
        "Output only the commit message.\n\n" +
        `Changes:\n\n\`\`\`diff\n${diffText}\n\`\`\``;

      const requestProvider = provider ?? "jait";
      let message = "";

      if (requestProvider === "jait") {
        const userApiKeys = userService?.getSettings(authUser.id).apiKeys ?? {};
        const effectiveModel = model?.trim() || userApiKeys["OPENAI_MODEL"]?.trim() || config.openaiModel;
        const isOllama = !userApiKeys["OPENAI_API_KEY"]?.trim() && config.llmProvider === "ollama";
        const baseUrl = isOllama ? `${config.ollamaUrl}/v1` : (userApiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl);
        const apiKey = isOllama ? "ollama" : (userApiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey);

        const llmRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: effectiveModel,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert developer. Generate a concise git commit message in the imperative mood " +
                  "(e.g. 'Add feature' not 'Added feature'). " +
                  "Subject line must be 72 characters or less. " +
                  "Optionally follow with a blank line and brief bullet points for significant details. " +
                  "Output ONLY the commit message — no explanation, no backtick fences, no surrounding quotes.",
              },
              { role: "user", content: `Generate a git commit message for these changes:\n\n\`\`\`diff\n${diffText}\n\`\`\`` },
            ],
            max_tokens: 256,
            temperature: 0.3,
          }),
        });

        if (!llmRes.ok) {
          const errBody = await llmRes.json().catch(() => ({})) as Record<string, unknown>;
          const msg = (errBody["error"] as Record<string, unknown> | undefined)?.["message"] as string | undefined;
          return reply.status(502).send({ error: msg ?? "LLM request failed" });
        }

        const data = await llmRes.json() as { choices?: Array<{ message?: { content?: string } }> };
        message = data.choices?.[0]?.message?.content?.trim() ?? "";
      } else {
        if (!providerRegistry) {
          return reply.status(501).send({ error: "CLI provider-backed commit generation is not configured" });
        }

        const pathExistsLocally = existsSync(cwd);
        let cliProvider: CliProviderAdapter | null = null;

        if (!pathExistsLocally && ws) {
          const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(cwd);
          const expectedPlatform = isWindowsPath ? "windows" : null;
          for (const node of ws.getFsNodes()) {
            if (node.isGateway) continue;
            if (expectedPlatform && node.platform !== expectedPlatform) continue;
            if (!node.providers?.includes(requestProvider)) continue;
            cliProvider = new RemoteCliProvider(ws, node.id, requestProvider);
            break;
          }
        }

        if (!cliProvider) {
          cliProvider = providerRegistry.get(requestProvider) ?? null;
        }
        if (!cliProvider) {
          return reply.status(400).send({ error: `Unknown provider: ${requestProvider}` });
        }
        const available = await cliProvider.checkAvailability();
        if (!available) {
          return reply.status(400).send({ error: cliProvider.info.unavailableReason ?? `Provider ${requestProvider} is not available` });
        }

        message = await generateCommitMessageWithCliProvider(cliProvider, cwd, prompt, model?.trim() || undefined);
      }

      if (!message) return reply.status(502).send({ error: "LLM returned an empty response" });

      return { message };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to generate commit message" });
    }
  });

  app.log.info("Git routes registered at /api/git/*");
}
