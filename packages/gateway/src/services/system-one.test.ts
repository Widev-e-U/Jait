import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateDecision, rankSystemOne, systemOneEnabled } from "./system-one.js";
import { ToolRegistry } from "../tools/registry.js";
import { buildSystemOneToolSchemas, buildTieredToolSchemas } from "../tools/agent-loop.js";
import { createDecisionEvaluateTool } from "../tools/decision.js";
import { buildSystemPrompt } from "../tools/prompts/index.js";
import { buildCliProviderSystemPrompt } from "../routes/chat.js";

let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
afterEach(() => vi.unstubAllGlobals());
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}

describe("System One Model", () => {
  it("makes no calls and preserves exact selection when no key is configured", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const r = registry(); const opts = { query: "read project file" };
    expect(systemOneEnabled({ JEV_API_KEY: "  " })).toBe(false);
    expect(await buildSystemOneToolSchemas(r, undefined, opts)).toEqual(buildTieredToolSchemas(r, undefined, opts));
    expect(await r.rankSearchWithSystemOne("read files")).toEqual(r.rankSearch("read files"));
    await expect(evaluateDecision({}, "some context", questions)).rejects.toThrow("not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the documented request shape and isolates cached answers by account", async () => {
    const fetcher = vi.fn().mockImplementation(async () => response({ relevant: { type: "noul", noul: 0.9 } })); vi.stubGlobal("fetch", fetcher);
    const account = keys();
    await evaluateDecision(account, "user request", questions);
    await evaluateDecision(account, "user request", questions);
    await evaluateDecision(keys(), "user request", questions);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.headers.Authorization).toBe(`Bearer ${account.JEV_API_KEY}`);
    expect(JSON.parse(init.body)).toEqual({ model: "jev-latest", state: "user request", questions });
    expect(init.redirect).toBe("error");
  });

  it("ranks authorized tools semantically and includes the decision tool", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(init.body).not.toContain("confidential");
      return response(Object.fromEntries(Object.entries(body.questions).map(([id, q]) => [id, { type: "noul", noul: (q as { instructions: string }).instructions.includes("web.search") ? 0.95 : 0.1 }])));
    }); vi.stubGlobal("fetch", fetcher);
    const r = registry();
    const schemas = await buildSystemOneToolSchemas(r, new Set(["secret.read"]), { query: "read project files but need public information", selectionLimit: 1 }, keys());
    const names = schemas.map(s => s.function.name);
    expect(names).toContain("web_search"); expect(names).toContain("decision_evaluate");
    expect(names).not.toContain("secret_read"); expect(names).not.toContain("file_read");
  });

  it("preserves empty lexical matches on service errors and circuit-breaks failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("outage", { status: 503 })); vi.stubGlobal("fetch", fetcher);
    const r = registry(); const account = keys();
    expect(await r.rankSearchWithSystemOne("zzzzzzzz", {}, account)).toEqual([]);
    expect(await r.rankSearchWithSystemOne("read files", {}, account)).toEqual(r.rankSearch("read files"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original memory order on malformed results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ item0: { type: "noul", noul: 4 } })));
    const memories = ["prefers concise replies", "uses Linux"];
    expect(await rankSystemOne(keys(), "user preferences", memories, x => x, "memory")).toBe(memories);
  });

  it("bounds network latency and falls back on timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    })));
    const items = ["memory one", "memory two"];
    expect(await rankSystemOne(keys(), "request", items, x => x, "memory")).toBe(items);
  });

  it("returns the original order when a request is cancelled", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController(); controller.abort();
    const items = ["one", "two"];
    expect(await rankSystemOne(keys(), "request", items, x => x, "memory", controller.signal)).toBe(items);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("batches explicit choice, score and yes/no questions through the tool", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      route: { type: "choice", choice: "technical", confidence: 0.9 },
      severity: { type: "score", score: 1.2, confidence: 0.7 }, urgent: { type: "noul", noul: 0.8 },
    })); vi.stubGlobal("fetch", fetcher);
    const result = await createDecisionEvaluateTool().execute({ state: "Payment integration fails for all customers", questions: [
      { id: "route", type: "choice", instructions: "Which team?", options: [{ id: "billing", description: "Invoices" }, { id: "technical", description: "Integration errors" }] },
      { id: "severity", type: "score", instructions: "How severe?", levels: ["Minor", "Major", "Critical"] },
      { id: "urgent", type: "noul", instructions: "Is this urgent?" },
    ] }, { sessionId: "s", actionId: "a", projectRoot: "/tmp", requestedBy: "test", apiKeys: keys() });
    expect(result.ok).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).questions.route.criteria).toEqual({ billing: "Invoices", technical: "Integration errors" });
  });

  it("rejects unknown choices and out-of-range scores", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ route: { type: "choice", choice: "invented" } })));
    await expect(evaluateDecision(keys(), "request", { route: { type: "choice", instructions: "Pick", criteria: { a: "a", b: "b" } } })).rejects.toThrow("Unknown");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ level: { type: "score", score: 8 } })));
    await expect(evaluateDecision(keys(), "request", { level: { type: "score", instructions: "Rate", criteria: ["low", "high"] } })).rejects.toThrow("score");
  });

  it("advertises decision.evaluate in native and external prompts only when enabled", () => {
    const endpoint = { model: "test-model" };
    expect(buildSystemPrompt("agent", endpoint, {})).not.toContain("<systemOneModel>");
    expect(buildSystemPrompt("agent", endpoint, { systemOne: true })).toContain("decision.evaluate");
    expect(buildCliProviderSystemPrompt("codex", undefined, "agent", {})).not.toContain("<systemOneModel>");
    expect(buildCliProviderSystemPrompt("codex", undefined, "agent", { systemOne: true })).toContain("decision.evaluate");
  });
});
