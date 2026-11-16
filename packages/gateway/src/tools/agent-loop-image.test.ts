import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop, toolDefsToSchemas, type LlmContextFlowRound } from "./agent-loop.js";
import type { ToolResult } from "./contracts.js";

afterEach(() => vi.restoreAllMocks());

describe("image.view in the native agent loop", () => {
  it("delivers visual bytes after all tool responses without retaining them in diagnostic context", async () => {
    const requests: any[] = [], rounds: LlmContextFlowRound[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      if (requests.length === 1) return new Response([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"image-1","type":"function","function":{"name":"image_view","arguments":"{\\"path\\":\\"a.png\\"}"}},{"index":1,"id":"image-2","type":"function","function":{"name":"image_view","arguments":"{\\"path\\":\\"b.png\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ].join(""));
      return new Response('data: {"choices":[{"delta":{"content":"Done"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    });
    const schemas = toolDefsToSchemas([{ name: "image.view", description: "View image", parameters: { type: "object", properties: { path: { type: "string" } } } }]);
    const result = await runAgentLoop({
      llm: { openaiApiKey: "fixture", openaiBaseUrl: "https://llm.test", openaiModel: "fixture", contextWindow: 100_000 },
      history: [{ role: "system", content: "system" }, { role: "user", content: "Read the pictures" }],
      toolSchemas: schemas, hasTools: true, sessionId: "image-agent-test", abort: new AbortController(), maxRounds: 3,
      onContext: round => rounds.push(round),
    }, async (_name, input) => {
      const value = (input as { path: string }).path === "a.png" ? "SU1BR0Ux" : "SU1BR0Uy";
      const output: ToolResult = { ok: true, message: "Image displayed", data: { base64: value } };
      Object.defineProperty(output, "modelImage", { value: { base64: value, mimeType: "image/png" }, enumerable: false });
      return output;
    });
    expect(result.content).toBe("Done");
    expect(requests).toHaveLength(2);
    const sent = requests[1].messages as any[];
    expect(sent.slice(-3).map(message => message.role)).toEqual(["tool", "tool", "user"]);
    expect(JSON.stringify(sent.at(-1))).toContain("SU1BR0Ux");
    expect(JSON.stringify(sent.at(-1))).toContain("SU1BR0Uy");
    expect(JSON.stringify(sent.slice(-3, -1))).not.toContain("SU1BR0U");
    expect(JSON.stringify(rounds)).not.toContain("SU1BR0U");
    expect(JSON.stringify(rounds)).toContain("image content omitted");
  });

  it("never retries a project chat creation after an uncertain or failed submission", async () => {
    let requestCount = 0, executions = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      requestCount++;
      if (requestCount === 1) return new Response([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"create-1","type":"function","function":{"name":"project_chat_create","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ].join(""));
      return new Response('data: {"choices":[{"delta":{"content":"Check the created chat."}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    });
    const schemas = toolDefsToSchemas([{ name: "project.chat.create", description: "Create a chat", parameters: { type: "object", properties: {} } }]);
    await runAgentLoop({
      llm: { openaiApiKey: "fixture", openaiBaseUrl: "https://llm.test", openaiModel: "fixture", contextWindow: 100_000 },
      history: [{ role: "user", content: "Create the chat" }], toolSchemas: schemas, hasTools: true,
      sessionId: "chat-retry-test", abort: new AbortController(), maxRounds: 3, maxRetries: 2,
    }, async () => { executions++; return { ok: false, message: "Created chat but request rejected: HTTP 503" }; });
    expect(executions).toBe(1);
  });

});
