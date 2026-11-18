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
      target: { type: "string", description: "For click: a single control with its full visible label. Requires System One; supply target or selector, never both. Do not include credentials." },
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
      ...common, name: "browser.task",
      description: "Prefer this for an authorized multi-step browser goal instead of separate calls for each action. Execute a short task in the already open browser. Omit actions for an adaptive loop that chooses clicks, typing, dropdown selections, scrolling, or waiting from fresh page feedback; it cannot click arbitrary coordinates. For adaptive text entry, supply fieldValues with exact selectors, accessible names and documentUrl/documentTimeOrigin from an earlier browser snapshot, plus user-authorized text; the task description need not repeat those values to avoid repeated handoffs; values are never sent to System One as fieldValues. The field name and selector must uniquely match the fresh page. On status needs_text, immediately call browser.task again with the returned resumeToken and the exact authorized text in text; this continues the same task and preserves its action limit. Do not invent missing information or credentials. If the user has not provided enough information, ask instead. A continuation expires with the task deadline, can be used once, and cannot be resumed after a restart. Optionally supply up to 12 concrete candidate actions with conditions. System One chooses among them using fresh structured page feedback after each action, or stops when uncertain. Each action runs at most once through normal browser permissions. Page text is sent to the configured System One provider. Set visual to send screenshots to System One before decisions and after the final action, including visible canvas and iframe content; screenshots can contain sensitive page content and are saved in the project. Visual support depends on the configured provider. Verify the final page; do not include secrets or actions the user has not authorized.",
      parameters: { type: "object", properties: {
        task: { type: "string", description: "User-authorized goal and relevant context; required when starting a task." },
        resumeToken: { type: "string", description: "For needs_text only: the exact token returned by browser.task. Supply only resumeToken and text when resuming." },
        text: { type: "string", description: "For needs_text only: the exact authorized text for the selected field; supply with resumeToken." },
        fieldValues: { type: "array", description: "Adaptive mode: exact authorized text for observed fields. Each selector must be unique, and name must exactly match the observed accessible name (use an empty string when absent), and documentUrl/documentTimeOrigin must match the observation. Unmatched or ambiguous fields still require a handoff. Do not supply credentials.", items: { type: "object", properties: { selector: { type: "string" }, name: { type: "string" }, text: { type: "string" }, documentUrl: { type: "string" }, documentTimeOrigin: { type: "number" } }, required: ["selector", "name", "text", "documentUrl", "documentTimeOrigin"] } },
        visual: { type: "boolean", description: "Opt in to capturing screenshots and sending them to System One for this task." },
        maxActions: { type: "number", description: "Adaptive mode: maximum actions, 1–100 (default 30)." },
        actions: { type: "array", description: "Concrete candidate actions and when each should run", items: { type: "object", properties: {
          when: { type: "string", description: "Page condition and ordering for this action" },
          step: { type: "object", properties: {
            action: { type: "string", enum: ["navigate", "click", "type", "select", "wait", "check"] },
            label: { type: "string" }, url: { type: "string" }, selector: { type: "string" }, target: { type: "string" },
            text: { type: "string" }, value: { type: "string" }, timeoutMs: { type: "number" },
          }, required: ["action", "label"] },
        }, required: ["when", "step"] } },
      } },
      execute: async (input, context) => service.runTask(input, context),
    },
    {
      ...common, name: "browser.workflow.save",
      description: "Save a reusable, structured browser workflow in this project. Click steps can use a selector or, with System One configured, a target containing the full visible control label. Updates require the current expectedRevision. Review the saved steps before running. Use checkpoints for login and user decisions; never save secrets. Markdown skills may explain the workflow but are not executable steps.",
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
