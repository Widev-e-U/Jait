import type { AppConfig } from "../../config.js";
import { createAgentSpawnTool } from "../../tools/agent-tools.js";
import type { ToolRegistry } from "../../tools/registry.js";
import { resolveJaitLlmConfig } from "../jait-llm.js";
import type { JaitBackend, UserService } from "../users.js";
import type { SubAgentRunner } from "./executor.js";

export function createInProcessWorkflowWorker(
  config: AppConfig,
  users: Pick<UserService, "getSettings">,
  toolRegistry: ToolRegistry,
): SubAgentRunner {
  return {
    async run({ userId, runId, attemptId, claims, prompt, signal, recordAgentRef }) {
      signal.throwIfAborted();
      if (claims.writes.length > 0 || claims.reads.length > 0) {
        throw new Error("workflow worker requires scoped workspace access for declared resources");
      }
      const settings = users.getSettings(userId);
      if (settings.chatProvider !== "jait") {
        throw new Error("workflow workers require the owner's in-process Jait provider");
      }
      const worker = createAgentSpawnTool({
        toolRegistry,
        restrictedTools: [],
        onInProcessStart: recordAgentRef,
        getLLMConfig: ({ apiKeys, model, jaitBackend }) => resolveJaitLlmConfig({
          config, apiKeys, requestedModel: model, jaitBackend: jaitBackend as JaitBackend | undefined,
          strictModel: true,
        }),
      });
      const result = await worker.execute({ prompt, description: "Workflow task" }, {
        userId,
        sessionId: runId,
        actionId: attemptId,
        requestedBy: "workflow",
        projectRoot: "",
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
