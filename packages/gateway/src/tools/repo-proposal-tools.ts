import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import type { RepositoryService, RepoRow } from "../services/repositories.js";
import type { RepoProposalService } from "../services/repo-proposals.js";
import type { ThreadService } from "../services/threads.js";

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function matchRepositoryForWorkspace(
  repositories: RepoRow[],
  workspaceRoot: string,
): RepoRow | null {
  const direct = repositories.find((repo) => workspaceRoot.startsWith(repo.localPath));
  if (direct) return direct;
  return repositories.find((repo) => workspaceRoot.includes(repo.name)) ?? null;
}

export function createRepoProposalTool(deps: {
  repoService: RepositoryService;
  repoProposalService: RepoProposalService;
  threadService?: ThreadService;
}): ToolDefinition {
  return {
    name: "repo.proposals",
    description:
      "Manage repo-scoped proposal messages for future agent threads. Use this to save good follow-up user prompts that should be easy to run later.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "add", "remove"],
          description: "Operation to perform.",
        },
        repoId: {
          type: "string",
          description: "Explicit repository ID. Omit to infer it from the current workspaceRoot.",
        },
        proposalId: {
          type: "string",
          description: "Proposal ID to remove. Required for action=remove.",
        },
        message: {
          type: "string",
          description: "Recommended future user message to save. Required for action=add.",
        },
      },
      required: ["action"],
    },
    execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const body = input && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const action = readString(body, "action");
      if (!action) {
        return { ok: false, message: "action is required" };
      }

      const repositories = deps.repoService.list(context.userId);
      const repoId = readString(body, "repoId");
      const repo = repoId
        ? repositories.find((item) => item.id === repoId) ?? null
        : matchRepositoryForWorkspace(repositories, context.workspaceRoot);
      if (!repo) {
        return { ok: false, message: "Could not resolve a repository for this proposal action." };
      }

      if (action === "list") {
        const proposals = deps.repoProposalService.listByRepo(repo.id);
        return {
          ok: true,
          message: `Loaded ${proposals.length} proposal${proposals.length === 1 ? "" : "s"} for ${repo.name}.`,
          data: { repo, proposals },
        };
      }

      if (action === "add") {
        const message = readString(body, "message");
        if (!message) return { ok: false, message: "message is required for add" };
        const thread = deps.threadService?.getById(context.sessionId);
        const proposal = deps.repoProposalService.create({
          repoId: repo.id,
          userId: context.userId,
          message,
          sourceThreadId: thread?.id ?? null,
          sourceThreadTitle: thread?.title ?? null,
        });
        return {
          ok: true,
          message: `Saved a repo proposal for ${repo.name}.`,
          data: { repo, proposal },
        };
      }

      if (action === "remove") {
        const proposalId = readString(body, "proposalId");
        if (!proposalId) return { ok: false, message: "proposalId is required for remove" };
        const proposal = deps.repoProposalService.getById(proposalId);
        if (!proposal || proposal.repoId !== repo.id || proposal.userId !== (context.userId ?? null)) {
          return { ok: false, message: "Proposal not found." };
        }
        deps.repoProposalService.delete(proposalId);
        return {
          ok: true,
          message: `Removed repo proposal from ${repo.name}.`,
          data: { repoId: repo.id, proposalId },
        };
      }

      return { ok: false, message: `Unsupported action: ${action}` };
    },
  };
}
