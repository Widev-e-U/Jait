import { z } from "zod";
import type { BrowserWorkflowService } from "../services/browser-workflows.js";
import type { ToolDefinition, ToolPropertySchema } from "./contracts.js";

const id = z.string().min(1).max(100);
const revision = z.number().int().positive();
const definitionProperty: ToolPropertySchema = {
  type: "object",
  description: "Versioned workflow. Use {{inputName}} in step fields. No passwords or tokens; use a checkpoint for browser login. First step must be open.",
  properties: {
    formatVersion: { type: "number" }, name: { type: "string" }, description: { type: "string" },
    inputs: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, description: { type: "string" }, default: { type: "string" },
    }, required: ["name", "description"] } },
    steps: { type: "array", items: { type: "object", properties: {
      action: { type: "string", enum: ["open", "navigate", "click", "type", "select", "wait", "snapshot", "extract", "check", "checkpoint"] },
      label: { type: "string" }, url: { type: "string" }, selector: { type: "string" },
      instruction: { type: "string" }, fields: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, description: { type: "string" }, type: { type: "string", enum: ["string", "number", "boolean", "strings"] },
      }, required: ["name", "description", "type"] } },
      text: { type: "string" }, value: { type: "string" }, timeoutMs: { type: "number" }, message: { type: "string" },
    }, required: ["action", "label"] } },
  }, required: ["formatVersion", "name", "steps"],
};

export function createBrowserWorkflowTools(service: BrowserWorkflowService): ToolDefinition[] {
  const common = { tier: "standard", category: "browser", source: "builtin", page: "chat" } as const;
  const idProperty = { type: "string", description: "Saved workflow ID" };
  return [
    {
      ...common, name: "browser.workflow.save",
      description: "Save a reusable, structured browser workflow in this project. Updates require the current expectedRevision. Review the saved steps before running. Use checkpoints for login and user decisions; never save secrets. Markdown skills may explain the workflow but are not executable steps.",
      parameters: { type: "object", properties: { definition: definitionProperty, id: idProperty, expectedRevision: { type: "number" } }, required: ["definition"] },
      async execute(input, context) {
        const body = z.object({ definition: z.unknown(), id: id.optional(), expectedRevision: revision.optional() }).strict().parse(input);
        const record = service.save(body.definition, context, body.id, body.expectedRevision);
        return { ok: true, message: `Saved workflow revision ${record.revision}. Review before running.`, data: record };
      },
    },
    {
      ...common, name: "browser.workflow.list", description: "List up to 50 saved browser workflows owned by the current user in this project.",
      parameters: { type: "object", properties: {} },
      execute: async (_input, context) => ({ ok: true, message: "Saved browser workflows", data: service.list(context) }),
    },
    {
      ...common, name: "browser.workflow.get", description: "Read the saved definition and revision of a browser workflow before reviewing or rerunning it.",
      parameters: { type: "object", properties: { id: idProperty }, required: ["id"] },
      execute: async (input, context) => ({ ok: true, message: "Saved browser workflow", data: service.get(z.object({ id }).strict().parse(input).id, context) }),
    },
    {
      ...common, name: "browser.workflow.run",
      description: "Run a reviewed saved browser workflow sequentially through normal consent and browser tools. Requires expectedRevision and named string inputs. Opens this chat's visible browser, supports human checkpoints, streams progress, and saves history. Stops on failure or cancellation without automatic retry. Can be scheduled using cron.add with this tool and input; existing consent still applies. Login requires a user at the browser.",
      parameters: { type: "object", properties: { id: idProperty, expectedRevision: { type: "number" }, values: { type: "object", description: "Named non-secret string inputs. Defaults apply when omitted." } }, required: ["id", "expectedRevision"] },
      execute: async (input, context) => {
        const body = z.object({ id, expectedRevision: revision, values: z.record(z.string(), z.string().max(4000)).default({}) }).strict().parse(input);
        return service.run(body.id, body.values, context, body.expectedRevision);
      },
    },
    {
      ...common, name: "browser.workflow.runs", description: "Inspect a saved workflow run by runId, or list the latest 50 runs in this project. Records show progress, failure, cancellation and interruption, without persisting input values or page snapshots.",
      parameters: { type: "object", properties: { runId: { type: "string" } } },
      execute: async (input, context) => {
        const body = z.object({ runId: id.optional() }).strict().parse(input);
        return { ok: true, message: "Browser workflow run history", data: body.runId ? service.getRun(body.runId, context) : service.listRuns(context) };
      },
    },
    {
      ...common, name: "browser.workflow.cancel", description: "Request cancellation of an active browser workflow. Already completed effects are not undone. Inspect run history for the final status.",
      parameters: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
      execute: async (input, context) => ({ ok: true, message: "Cancellation requested; completed actions remain applied.", data: service.cancel(z.object({ runId: id }).strict().parse(input).runId, context) }),
    },
  ];
}
