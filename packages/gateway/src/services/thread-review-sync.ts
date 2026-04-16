import { existsSync } from "node:fs";
import type { ThreadRow, ThreadService } from "./threads.js";
import { GitService, cleanupWorktreeRemoteAware, parseGitRemote } from "./git.js";
import type { GitForge } from "./git-forge.js";
import { getForge } from "./git-forge.js";
import type { WsControlPlane } from "../ws.js";

interface ThreadReviewSyncDeps {
  threadService: ThreadService;
  ws?: WsControlPlane;
  gitService?: Pick<GitService, "getPreferredRemote" | "getRemoteUrl">;
  resolveForge?: (remoteUrl: string) => GitForge | null;
  log?: Pick<Console, "error">;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const THREAD_REVIEW_SYNC_LIMIT = 100;

export class ThreadReviewSyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly gitService: Pick<GitService, "getPreferredRemote" | "getRemoteUrl">;
  private readonly resolveForge: (remoteUrl: string) => GitForge | null;
  private readonly log: Pick<Console, "error">;

  constructor(private readonly deps: ThreadReviewSyncDeps) {
    this.gitService = deps.gitService ?? new GitService();
    this.resolveForge = deps.resolveForge ?? ((remoteUrl: string) => {
      const parsed = parseGitRemote(remoteUrl);
      return parsed ? getForge(parsed.provider) : null;
    });
    this.log = deps.log ?? console;
  }

  start(intervalMs = DEFAULT_POLL_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = this.deps.threadService
        .list(undefined, THREAD_REVIEW_SYNC_LIMIT)
        .filter((thread) => this.isReviewSyncCandidate(thread));
      for (const thread of candidates) {
        await this.syncThread(thread);
      }
    } finally {
      this.running = false;
    }
  }

  private isReviewSyncCandidate(thread: ThreadRow): boolean {
    return thread.kind === "delivery"
      && typeof thread.branch === "string"
      && thread.branch.length > 0
      && typeof thread.workingDirectory === "string"
      && thread.workingDirectory.length > 0
      && thread.prState !== "merged"
      && thread.prState !== "closed"
      && (thread.prState === "open" || thread.prState === "creating" || !!thread.prUrl);
  }

  private async syncThread(thread: ThreadRow): Promise<void> {
    try {
      const context = await this.resolveRemoteContext(thread.workingDirectory!, thread.branch!);
      if (!context) return;

      const { remoteUrl, remote, execCwd } = context;
      const forge = this.resolveForge(remoteUrl);
      if (!forge) return;

      const pr = await forge.findExistingPr(execCwd, remote, thread.branch!);
      if (!pr) return;

      const nextState = pr.state ?? null;
      const metadataChanged =
        (pr.url ?? null) !== (thread.prUrl ?? null)
        || (pr.number ?? null) !== (thread.prNumber ?? null)
        || (pr.title ?? null) !== (thread.prTitle ?? null)
        || (pr.baseBranch ?? null) !== (thread.prBaseBranch ?? null);
      const stateChanged = nextState !== (thread.prState ?? null);

      if (!metadataChanged && !stateChanged) return;

      let updated = this.deps.threadService.update(thread.id, {
        prUrl: pr.url ?? thread.prUrl ?? null,
        prNumber: pr.number ?? thread.prNumber ?? null,
        prTitle: pr.title ?? thread.prTitle ?? null,
        prBaseBranch: pr.baseBranch ?? thread.prBaseBranch ?? null,
        prState: nextState,
      });

      if (!updated) return;

      if (stateChanged) {
        const summary = this.buildPrStateSummary(nextState, updated.prUrl ?? thread.prUrl ?? null);
        if (summary) {
          const activity = this.deps.threadService.addActivity(thread.id, "activity", summary, {
            action: "pr_state_changed",
            previousPrState: thread.prState,
            prState: nextState,
            prUrl: updated.prUrl ?? thread.prUrl ?? null,
            syncSource: "gateway_poll",
          });
          this.broadcastThreadEvent(thread.id, "activity", { activity });
        }

        if (nextState === "merged" || nextState === "closed") {
          updated = this.deps.threadService.update(thread.id, {
            providerSessionId: null,
            workingDirectory: null,
            branch: null,
          }) ?? updated;
          void cleanupWorktreeRemoteAware(thread.workingDirectory!, this.deps.ws, thread.branch).catch(() => {});
        }
      }

      this.broadcastThreadEvent(thread.id, "updated", { thread: updated });
    } catch (error) {
      this.log.error(
        `[thread-review-sync] Failed to sync thread ${thread.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async resolveRemoteContext(
    cwd: string,
    branch: string,
  ): Promise<{ remoteUrl: string; remote: NonNullable<ReturnType<typeof parseGitRemote>>; execCwd: string } | null> {
    const localPath = existsSync(cwd);
    const execCwd = localPath ? cwd : process.cwd();

    let remoteUrl: string | null = null;
    if (localPath) {
      const remoteName = await this.gitService.getPreferredRemote(cwd, branch);
      if (!remoteName) return null;
      remoteUrl = await this.gitService.getRemoteUrl(cwd, remoteName);
    } else {
      remoteUrl = await this.resolveRemoteUrlViaNode(cwd, branch);
    }

    if (!remoteUrl) return null;
    const remote = parseGitRemote(remoteUrl);
    if (!remote) return null;
    return { remoteUrl, remote, execCwd };
  }

  private async resolveRemoteUrlViaNode(cwd: string, branch: string): Promise<string | null> {
    if (!this.deps.ws) return null;
    const node = this.findRemoteNodeForPath(cwd);
    if (!node) return null;

    try {
      const configuredRemote = await this.deps.ws.proxyFsOp<{ stdout: string }>(
        node.id,
        "git",
        { cwd, args: `config --get branch.${branch}.remote` },
        15_000,
      ).then((result) => result.stdout.trim()).catch(() => "");

      const remotes: string[] = await this.deps.ws.proxyFsOp<{ stdout: string }>(
        node.id,
        "git",
        { cwd, args: "remote" },
        15_000,
      ).then((result) => result.stdout.split("\n").map((line) => line.trim()).filter(Boolean)).catch(() => []);

      const remoteName = configuredRemote && remotes.includes(configuredRemote)
        ? configuredRemote
        : remotes.includes("origin")
          ? "origin"
          : remotes[0] ?? null;
      if (!remoteName) return null;

      const result = await this.deps.ws.proxyFsOp<{ stdout: string }>(
        node.id,
        "git",
        { cwd, args: `remote get-url ${remoteName}` },
        15_000,
      );
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private findRemoteNodeForPath(cwd: string): { id: string } | null {
    if (!this.deps.ws) return null;
    const isWindowsPath = /^[A-Za-z]:[\\/]/.test(cwd);
    const expectedPlatform = isWindowsPath ? "windows" : null;
    for (const node of this.deps.ws.getFsNodes()) {
      if (node.isGateway) continue;
      if (expectedPlatform && node.platform !== expectedPlatform) continue;
      return { id: node.id };
    }
    return null;
  }

  private buildPrStateSummary(
    prState: "open" | "closed" | "merged" | null,
    prUrl: string | null,
  ): string | null {
    if (prState === "open") return prUrl ? `Pull request created: ${prUrl}` : "Pull request created";
    if (prState === "merged") return prUrl ? `Pull request merged: ${prUrl}` : "Pull request merged";
    if (prState === "closed") return prUrl ? `Pull request closed: ${prUrl}` : "Pull request closed";
    return null;
  }

  private broadcastThreadEvent(threadId: string, event: string, data: unknown): void {
    if (!this.deps.ws) return;
    this.deps.ws.broadcastAll({
      type: `thread.${event}` as any,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: { threadId, ...data as Record<string, unknown> },
    });
  }
}
