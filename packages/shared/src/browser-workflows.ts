import { z } from "zod";

const text = z.string().min(1).max(4000);
const selector = z.string().min(1).max(1000);
const step = <T extends z.ZodRawShape>(shape: T) => z.object({ label: z.string().min(1).max(120), ...shape }).strict();

export const browserExtractionFieldsSchema = z.array(z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
  description: z.string().min(1).max(500),
  type: z.enum(["string", "number", "boolean", "strings"]),
}).strict()).min(1).max(20).refine(fields => new Set(fields.map(field => field.name)).size === fields.length, "Field names must be unique");

export function browserWorkflowStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(browserWorkflowStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(browserWorkflowStrings);
  return [];
}

export type BrowserExtractionFields = z.infer<typeof browserExtractionFieldsSchema>;

/** Deliberately excludes scripts, arbitrary tool calls, browser IDs and credentials. */
export const browserWorkflowStepSchema = z.discriminatedUnion("action", [
  step({ action: z.literal("open"), url: text }),
  step({ action: z.literal("navigate"), url: text }),
  step({ action: z.literal("click"), selector }),
  step({ action: z.literal("type"), selector, text }),
  step({ action: z.literal("select"), selector, value: text }),
  step({ action: z.literal("wait"), selector, timeoutMs: z.number().int().min(1).max(30000).optional() }),
  step({ action: z.literal("snapshot") }),
  step({ action: z.literal("extract"), instruction: text, fields: browserExtractionFieldsSchema }),
  step({ action: z.literal("check"), selector, text: text.optional() }),
  step({ action: z.literal("checkpoint"), message: text }),
]);

export const browserWorkflowSchema = z.object({
  formatVersion: z.literal(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  inputs: z.array(z.object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
    description: z.string().max(500),
    default: z.string().max(4000).optional(),
  }).strict()).max(20).default([]),
  steps: z.array(browserWorkflowStepSchema).min(1).max(100),
}).strict().superRefine((workflow, context) => {
  const names = new Set(workflow.inputs.map(input => input.name));
  if (names.size !== workflow.inputs.length) context.addIssue({ code: "custom", message: "Input names must be unique" });
  for (const item of workflow.steps) {
    for (const value of browserWorkflowStrings(item)) {
      for (const match of value.matchAll(/\{\{([^{}]+)\}\}/g)) {
        if (!names.has(match[1]!)) context.addIssue({ code: "custom", message: `Unknown input: ${match[1]}` });
      }
    }
  }
  if (workflow.steps[0]?.action !== "open") context.addIssue({ code: "custom", message: "The first step must open the visible browser" });
});

export type BrowserWorkflowDefinition = z.infer<typeof browserWorkflowSchema>;
export type BrowserWorkflowStep = z.infer<typeof browserWorkflowStepSchema>;
export type BrowserWorkflowRunStatus = "running" | "waiting_for_user" | "succeeded" | "failed" | "cancelled" | "interrupted";
export interface BrowserWorkflowStepProgress {
  label: string;
  status: "pending" | "running" | "waiting_for_user" | "succeeded" | "failed" | "cancelled" | "interrupted";
}
export interface BrowserWorkflowRecord {
  id: string;
  revision: number;
  definition: BrowserWorkflowDefinition;
  createdAt: string;
  updatedAt: string;
}
export interface BrowserWorkflowRun {
  id: string;
  workflowId: string;
  revision: number;
  sessionId: string;
  status: BrowserWorkflowRunStatus;
  nextStep: number;
  steps: BrowserWorkflowStepProgress[];
  createdAt: string;
  updatedAt: string;
}
