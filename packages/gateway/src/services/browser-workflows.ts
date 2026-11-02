import { and, desc, eq, inArray } from "drizzle-orm";
import {
  browserWorkflowSchema, browserWorkflowStepSchema, type BrowserWorkflowRecord,
  type BrowserWorkflowRun,
} from "@jait/shared";
import type { JaitDB } from "../db/index.js";
import { browserWorkflows, browserWorkflowRuns } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";

type ExecuteTool = (name: string, input: unknown, context: ToolContext) => Promise<ToolResult>;
type RunRow = typeof browserWorkflowRuns.$inferSelect;

function scope(context: ToolContext) {
  if (!context.sessionId || !context.projectRoot) throw new Error("A workflow requires an active chat and project");
  return { userId: context.userId ?? "", projectRoot: context.projectRoot };
}
function workflowRecord(row: typeof browserWorkflows.$inferSelect): BrowserWorkflowRecord {
  return { id: row.id, revision: row.revision, definition: browserWorkflowSchema.parse(JSON.parse(row.definition)), createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function runRecord(row: RunRow): BrowserWorkflowRun {
  return { id: row.id, workflowId: row.workflowId, revision: row.revision, sessionId: row.sessionId,
    status: row.status as BrowserWorkflowRun["status"], nextStep: row.nextStep,
    steps: JSON.parse(row.progress), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/** All effects MUST use the injected gateway executor, including human handoffs. */
export class BrowserWorkflowService {
  private readonly active = new Map<string, { controller: AbortController; sessionId: string }>();

  constructor(private readonly db: JaitDB, private readonly executeTool: ExecuteTool) {
    // A process restart cannot establish whether an in-flight click took effect.
    // Preserve the revision and cursor, but never automatically replay that action.
    const interrupted = db.select().from(browserWorkflowRuns)
      .where(inArray(browserWorkflowRuns.status, ["running", "waiting_for_user"])).all();
    for (const row of interrupted) {
      const run = runRecord(row);
      run.status = "interrupted";
      for (const step of run.steps) if (step.status === "running" || step.status === "waiting_for_user") step.status = "interrupted";
      this.persist(run);
    }
  }

  save(definition: unknown, context: ToolContext, id?: string, expectedRevision?: number): BrowserWorkflowRecord {
    const owner = scope(context);
    const parsed = browserWorkflowSchema.parse(definition);
    if (JSON.stringify(parsed).length > 128000) throw new Error("Workflow definition exceeds 128 KB");
    const current = id ? this.get(id, context) : undefined;
    if (current && expectedRevision !== current.revision) throw new Error("Workflow changed; fetch it and supply its current expectedRevision");
    if (id && !current) throw new Error("Workflow not found");
    const now = new Date().toISOString();
    const record: BrowserWorkflowRecord = { id: id ?? uuidv7(), revision: (current?.revision ?? 0) + 1,
      definition: parsed, createdAt: current?.createdAt ?? now, updatedAt: now };
    if (current) {
      this.db.update(browserWorkflows).set({ revision: record.revision, definition: JSON.stringify(parsed), updatedAt: now })
        .where(eq(browserWorkflows.id, record.id)).run();
    } else this.db.insert(browserWorkflows).values({ ...owner, ...record, definition: JSON.stringify(parsed) }).run();
    return record;
  }

  get(id: string, context: ToolContext): BrowserWorkflowRecord {
    const owner = scope(context);
    const row = this.db.select().from(browserWorkflows).where(and(eq(browserWorkflows.id, id),
      eq(browserWorkflows.userId, owner.userId), eq(browserWorkflows.projectRoot, owner.projectRoot))).get();
    if (!row) throw new Error("Workflow not found");
    return workflowRecord(row);
  }

  list(context: ToolContext): BrowserWorkflowRecord[] {
    const owner = scope(context);
    return this.db.select().from(browserWorkflows).where(and(eq(browserWorkflows.userId, owner.userId),
      eq(browserWorkflows.projectRoot, owner.projectRoot))).orderBy(desc(browserWorkflows.updatedAt)).limit(50).all().map(workflowRecord);
  }

  getRun(id: string, context: ToolContext): BrowserWorkflowRun {
    const owner = scope(context);
    const row = this.db.select().from(browserWorkflowRuns).where(and(eq(browserWorkflowRuns.id, id),
      eq(browserWorkflowRuns.userId, owner.userId), eq(browserWorkflowRuns.projectRoot, owner.projectRoot))).get();
    if (!row) throw new Error("Workflow run not found");
    return runRecord(row);
  }

  listRuns(context: ToolContext): BrowserWorkflowRun[] {
    const owner = scope(context);
    return this.db.select().from(browserWorkflowRuns).where(and(eq(browserWorkflowRuns.userId, owner.userId),
      eq(browserWorkflowRuns.projectRoot, owner.projectRoot))).orderBy(desc(browserWorkflowRuns.createdAt)).limit(50).all().map(runRecord);
  }

  cancel(id: string, context: ToolContext): BrowserWorkflowRun {
    this.getRun(id, context); // Authorize before accessing an active controller.
    this.active.get(id)?.controller.abort();
    return this.getRun(id, context);
  }

  stop(): void { for (const active of this.active.values()) active.controller.abort(); }

  private persist(run: BrowserWorkflowRun): void {
    run.updatedAt = new Date().toISOString();
    this.db.update(browserWorkflowRuns).set({ status: run.status, nextStep: run.nextStep,
      progress: JSON.stringify(run.steps), updatedAt: run.updatedAt }).where(eq(browserWorkflowRuns.id, run.id)).run();
  }

  async run(id: string, values: Record<string, string>, context: ToolContext, expectedRevision: number): Promise<ToolResult> {
    const owner = scope(context);
    const workflow = this.get(id, context);
    if (workflow.revision !== expectedRevision) throw new Error("Workflow revision changed; review it before running");
    if (this.active.size >= 4 || [...this.active.values()].some(active => active.sessionId === context.sessionId)) {
      throw new Error("Workflow capacity reached or this chat already has a running workflow");
    }
    if (context.signal?.aborted) return { ok: false, message: "Workflow cancelled before starting" };
    const inputs = new Map<string, string>();
    const allowed = new Set(workflow.definition.inputs.map(input => input.name));
    for (const key of Object.keys(values)) if (!allowed.has(key)) throw new Error(`Unknown input: ${key}`);
    for (const input of workflow.definition.inputs) {
      const value = Object.hasOwn(values, input.name) ? values[input.name] : input.default;
      if (typeof value !== "string" || value.length > 4000) throw new Error(`Provide input: ${input.name} (${input.description})`);
      inputs.set(input.name, value);
    }
    // Resolve once, without evaluating expressions or recursively expanding user values.
    function resolveInputs(value: unknown): unknown {
      if (typeof value === "string") return value.replace(/\{\{([^{}]+)\}\}/g, (_, name: string) => inputs.get(name)!);
      if (Array.isArray(value)) return value.map(resolveInputs);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveInputs(item)]));
      return value;
    }
    const steps = workflow.definition.steps.map(step => browserWorkflowStepSchema.parse(resolveInputs(step)));
    for (const step of steps) {
      if (step.action === "open" || step.action === "navigate") {
        const url = new URL(step.url);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Workflow navigation requires an HTTP(S) URL without credentials");
      }
    }
    const now = new Date().toISOString();
    const run: BrowserWorkflowRun = { id: uuidv7(), workflowId: workflow.id, revision: workflow.revision,
      sessionId: context.sessionId, status: "running", nextStep: 0,
      steps: workflow.definition.steps.map(step => ({ label: step.label, status: "pending" })), createdAt: now, updatedAt: now };
    this.db.insert(browserWorkflowRuns).values({ ...owner, ...run, definition: JSON.stringify(workflow.definition), progress: JSON.stringify(run.steps) }).run();
    const controller = new AbortController();
    this.active.set(run.id, { controller, sessionId: context.sessionId });
    const cancel = () => controller.abort();
    context.signal?.addEventListener("abort", cancel, { once: true });
    // Includes consent and checkpoint waits. The executor retains the browser lock until it settles.
    const timeout = setTimeout(cancel, 30 * 60_000);
    const childContext = { ...context, signal: controller.signal };
    const outputs: Array<{ step: number; data: unknown }> = [];
    try {
      for (let index = 0; index < steps.length; index++) {
        if (controller.signal.aborted) { run.status = "cancelled"; break; }
        const step = steps[index]!;
        run.nextStep = index;
        run.status = step.action === "checkpoint" ? "waiting_for_user" : "running";
        run.steps[index]!.status = step.action === "checkpoint" ? "waiting_for_user" : "running";
        this.persist(run);
        context.onOutputChunk?.(`Workflow ${run.id}: step ${index + 1}/${steps.length} — ${run.steps[index]!.label}\n`);
        const { action, label: _label, ...input } = step;
        const tool = action === "checkpoint" ? "browser.handoff" : `browser.${action}`;
        const callId = `${run.id}-${index}`;
        context.onNestedEvent?.({ type: "tool_start", tool, args: input, call_id: callId });
        const result = await this.executeTool(tool, input, { ...childContext, actionId: callId });
        context.onNestedEvent?.({ type: "tool_result", tool, call_id: callId, ...result });
        if (controller.signal.aborted) {
          run.status = "cancelled"; run.steps[index]!.status = "cancelled"; break;
        }
        const handoffDone = action !== "checkpoint" || (result.data as { status?: string } | undefined)?.status === "done";
        if (!result.ok || !handoffDone) {
          run.status = "failed"; run.steps[index]!.status = "failed"; break;
        }
        if (action === "extract") outputs.push({ step: index, data: result.data });
        run.steps[index]!.status = "succeeded";
        run.nextStep = index + 1;
        run.status = index === steps.length - 1 ? "succeeded" : "running";
        this.persist(run);
      }
    } catch {
      // Tool errors may contain page text, credentials or resolved input values.
      run.status = controller.signal.aborted ? "cancelled" : "failed";
      const current = run.steps[run.nextStep];
      if (current) current.status = run.status;
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", cancel);
      this.active.delete(run.id);
      this.persist(run);
    }
    return { ok: run.status === "succeeded", message: `Workflow ${run.status}. ${run.nextStep}/${steps.length} steps completed. Inspect browser tool results before starting another run.`, data: { ...run, outputs } };
  }
}
