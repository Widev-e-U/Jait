import { z } from "zod";
import type { PlanService, PlanTask, PlanWithTasks } from "../services/plans.js";
import type { RepositoryService } from "../services/repositories.js";
import { validatePlanGraph } from "../services/orchestration/dag.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

export interface PlanToolDeps {
  planService: PlanService;
  repoService: RepositoryService;
  /** Called after a plan is stored, e.g. to broadcast it to open plan views. */
  onCreated?: (plan: PlanWithTasks) => void;
}

/** Fields an author may set on a task. Status is never accepted: approval belongs to the owner. */
const AUTHORED_TASK_FIELDS = [
  "id", "title", "description", "dependsOn", "resources", "worker",
  "maxAttempts", "timeoutSeconds", "priority", "verification",
] as const;

const taskInput = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  resources: z.unknown().optional(),
  worker: z.unknown().optional(),
  maxAttempts: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  priority: z.number().optional(),
  verification: z.array(z.unknown()),
}).strict();

const createInput = z.object({
  title: z.string().trim().min(1).max(200),
  repoId: z.string().min(1).max(200).optional(),
  tasks: z.array(taskInput).min(1),
}).strict();

/**
 * Chat surface for drafting plans. A created plan is a draft whose tasks are all
 * `proposed`; plan.run.start refuses it until the owner approves each task in the
 * plan view. The tool cannot approve, start or change an existing plan.
 */
export function createPlanTools(deps: PlanToolDeps): ToolDefinition[] {
  return [
    {
      name: "plan.create",
      description:
        "Draft a plan of dependency-ordered tasks for one of your repositories. The plan is validated like a run (ids, dependencies, cycles, resource claims, worker, at least one verification gate per task) and saved as a draft with every task proposed. It cannot approve tasks: the owner approves them in the repository's Plan view, and only then can plan.run.start run it. Defaults to the repository registered at the current project root.",
      tier: "standard",
      category: "agent",
      source: "builtin",
      page: "chat",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Plan title, 1-200 characters" },
          repoId: { type: "string", description: "Repository ID. Omit to use the repository at the current project root." },
          tasks: {
            type: "array",
            description: "Tasks in definition order. Status is not accepted; every task is saved as proposed.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Task id: letters, digits, '.', '_' or '-' (max 64)" },
                title: { type: "string" },
                description: { type: "string", description: "What the worker must do, up to 4000 characters" },
                dependsOn: { type: "array", items: { type: "string" }, description: "Ids of tasks that must pass first" },
                resources: {
                  type: "object",
                  description: "Project-relative claims: { reads?: string[], writes?: string[], protects?: string[] }. Omit to claim the whole project, which runs the task alone.",
                },
                worker: { type: "object", description: "{ kind: \"jait\" } (default) or { kind: \"acp\", providerId } (needs writes)" },
                maxAttempts: { type: "number", description: "1-5, default 2" },
                timeoutSeconds: { type: "number", description: "1-86400, default 1800" },
                priority: { type: "number", description: "-10..10, default 0" },
                verification: {
                  type: "array",
                  description: "At least one gate: { id, label, required?, check: { kind: \"command\", command, timeoutSeconds? } | { kind: \"artifact\", path } }",
                  items: { type: "object" },
                },
              },
              required: ["id", "title", "verification"],
            },
          },
        },
        required: ["title", "tasks"],
      },
      execute: async (input, context): Promise<ToolResult> => {
        const body = createInput.parse(input);
        const owner = ownerOf(context);
        const repo = body.repoId
          ? deps.repoService.getById(body.repoId)
          : deps.repoService.findByPath(context.projectRoot, owner);
        if (!repo || repo.userId !== owner) {
          return {
            ok: false,
            message: body.repoId
              ? "Repository not found"
              : `No repository of yours is registered at ${context.projectRoot}; pass repoId`,
          };
        }
        const graph = validatePlanGraph(body.tasks);
        if (!graph.ok) {
          return { ok: false, message: "Plan is invalid; nothing was saved", data: { issues: graph.issues } };
        }
        const tasks = body.tasks.map(proposedTask);
        const plan = deps.planService.create({ repoId: repo.id, userId: owner, title: body.title, tasks });
        deps.onCreated?.(plan);
        return {
          ok: true,
          message: `Draft plan "${plan.title}" saved with ${tasks.length} proposed task(s) in ${repo.name}. The owner must approve each task in the repository's Plan view before plan.run.start can run it.`,
          data: { planId: plan.id, repoId: repo.id, approvalRequired: true, order: graph.order, plan },
        };
      },
    },
  ];
}

/** Keep only authored fields, and mark the task proposed whatever the input says. */
function proposedTask(raw: z.infer<typeof taskInput>): PlanTask {
  const task: Record<string, unknown> = {};
  for (const field of AUTHORED_TASK_FIELDS) {
    if (raw[field] !== undefined) task[field] = raw[field];
  }
  task.description = typeof raw.description === "string" ? raw.description : "";
  task.status = "proposed";
  return task as unknown as PlanTask;
}

function ownerOf(context: ToolContext): string {
  if (!context.userId) throw new Error("plans need a signed-in owner");
  return context.userId;
}
