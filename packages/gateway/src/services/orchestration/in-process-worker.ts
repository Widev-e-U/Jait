import type { AppConfig } from "../../config.js";
import { createAgentSpawnTool } from "../../tools/agent-tools.js";
import type { ToolRegistry } from "../../tools/registry.js";
import { resolveJaitLlmConfig } from "../jait-llm.js";
import type { JaitBackend, UserService } from "../users.js";
import type { ToolExecutorFn } from "./command-verifier.js";
import type { SubAgentRunner } from "./executor.js";
import { workflowSessionId } from "./orchestrator.js";
import { allowedWorkflowTools, authorizeWorkflowToolCall } from "./workflow-tool-guard.js";

/**
 * Workflow worker on the owner's in-process Jait provider, with the same
 * sub-agent path as agent.spawn. A task without resources gets no tools. A task
 * with a workspace gets only the file tools for its mode. Each call is checked
 * against the workspace and the declared claims first, then runs through the
 * consent-aware executor.
 */
export function createInProcessWorkflowWorker(
  config: AppConfig,
  users: Pick<UserService, "getSettings">,
  toolRegistry: ToolRegistry,
  toolExecutor?: ToolExecutorFn,
): SubAgentRunner {
  return {
    async run({ userId, runId, attemptId, claims, workspace, prompt, signal, recordAgentRef }) {
      signal.throwIfAborted();
      if (!workspace && (claims.writes.length > 0 || claims.reads.length > 0)) {
        throw new Error("workflow worker requires scoped workspace access for declared resources");
      }
      if (workspace && !toolExecutor) {
        throw new Error("workflow workers with a workspace require the consent-aware tool executor");
      }
      const settings = users.getSettings(userId);
      if (settings.chatProvider !== "jait") {
        throw new Error("workflow workers require the owner's in-process Jait provider");
      }
      const scope = workspace;
      const executor = toolExecutor;
      const worker = createAgentSpawnTool({
        toolRegistry,
        restrictedTools: scope ? allowedWorkflowTools(scope.mode) : [],
        onInProcessStart: recordAgentRef,
        executeTool: scope && executor
          ? (name, input, context) => {
            const verdict = authorizeWorkflowToolCall({
              tool: name,
              args: input,
              mode: scope.mode,
              workspaceRoot: scope.path,
              claims,
            });
            if (!verdict.ok) return Promise.resolve({ ok: false, message: `Refused: ${verdict.reason}` });
            return executor(name, input, context);
          }
          : undefined,
        getLLMConfig: ({ apiKeys, model, jaitBackend }) => resolveJaitLlmConfig({
          config, apiKeys, requestedModel: model, jaitBackend: jaitBackend as JaitBackend | undefined,
          strictModel: true,
        }),
      });
      const result = await worker.execute({ prompt, description: "Workflow task" }, {
        userId,
        sessionId: workflowSessionId(runId),
        actionId: attemptId,
        requestedBy: "workflow",
        projectRoot: scope?.path ?? "",
        providerId: "jait",
        apiKeys: settings.apiKeys,
        model: settings.selectedModel?.trim() || undefined,
        jaitBackend: settings.jaitBackend,
        signal,
      });
      signal.throwIfAborted();
      const data = result.data as { content?: unknown } | undefined;
      if (!result.ok || typeof data?.content !== "string") {
        throw new Error("in-process workflow worker did not return a completed answer");
      }
      return { text: data.content };
    },
  };
}
