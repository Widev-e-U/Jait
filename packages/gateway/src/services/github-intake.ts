import { and, desc, eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { githubIntakeDecisions, githubIntakePolicies } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { AgentGithubWebhookEvent } from "../routes/agent-github-apps.js";

export interface GithubIntakeRule {
  repository: string;
  sender: string;
  event: "issues" | "issue_comment" | "pull_request" | "pull_request_review" | "check_run" | "workflow_run";
  action: string;
}

const events = new Set(["issues", "issue_comment", "pull_request", "pull_request_review", "check_run", "workflow_run"]);
const name = /^[a-zA-Z0-9_.-]{1,100}$/;
export function validateGithubIntakeRules(value: unknown): GithubIntakeRule[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Expected at most 20 rules");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid rule");
    const r = item as Record<string, unknown>;
    if (typeof r.repository !== "string" || !/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/.test(r.repository)
      || typeof r.sender !== "string" || !/^[a-zA-Z0-9_.-]{1,100}(?:\[bot\])?$/.test(r.sender)
      || typeof r.event !== "string" || !events.has(r.event)
      || typeof r.action !== "string" || !name.test(r.action)) throw new Error("Rules require an exact repository, sender, event and action");
    return { repository: r.repository, sender: r.sender, event: r.event as GithubIntakeRule["event"], action: r.action };
  });
}

export class GithubIntakeService {
  constructor(private db: JaitDB) {}
  rules(userId: string, agentId: string): GithubIntakeRule[] {
    const row = this.db.select().from(githubIntakePolicies).where(and(eq(githubIntakePolicies.userId, userId), eq(githubIntakePolicies.agentId, agentId))).get();
    return row ? validateGithubIntakeRules(JSON.parse(row.rules)) : [];
  }
  save(userId: string, agentId: string, rules: GithubIntakeRule[]) {
    const values = { id: uuidv7(), userId, agentId, rules: JSON.stringify(rules), updatedAt: new Date().toISOString() };
    this.db.insert(githubIntakePolicies).values(values).onConflictDoUpdate({ target: [githubIntakePolicies.userId, githubIntakePolicies.agentId], set: { rules: values.rules, updatedAt: values.updatedAt } }).run();
  }
  list(userId: string, agentId: string) {
    return this.db.select().from(githubIntakeDecisions).where(and(eq(githubIntakeDecisions.userId, userId), eq(githubIntakeDecisions.agentId, agentId))).orderBy(desc(githubIntakeDecisions.createdAt)).limit(100).all();
  }
  receive(input: AgentGithubWebhookEvent) {
    if (!input.deliveryId || !/^[a-zA-Z0-9-]{1,128}$/.test(input.deliveryId)) throw new Error("Missing or invalid delivery id");
    const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const bounded = (value: unknown) => typeof value === "string" ? value.slice(0, 201) : "";
    const repository = bounded(obj(input.payload.repository).full_name);
    const sender = bounded(obj(input.payload.sender).login);
    const event = bounded(input.event);
    const action = bounded(input.payload.action);
    const matched = this.rules(input.userId, input.agentId).some(rule => rule.repository.toLowerCase() === repository.toLowerCase() && rule.sender.toLowerCase() === sender.toLowerCase() && rule.event === event && rule.action === action);
    this.db.insert(githubIntakeDecisions).values({ id: uuidv7(), userId: input.userId, agentId: input.agentId, deliveryId: input.deliveryId, event, action, repository, sender, result: matched ? "would_accept" : "ignored", reason: matched ? "An exact rule matched; observe mode does not start work." : "No exact rule matched.", createdAt: new Date().toISOString() }).onConflictDoNothing({ target: [githubIntakeDecisions.userId, githubIntakeDecisions.agentId, githubIntakeDecisions.deliveryId] }).run();
  }
}
