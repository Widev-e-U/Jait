import {afterEach, expect, it, vi} from "vitest";
import {runAgentLoop} from "../tools/agent-loop.js";
import {callJaitLlmCompletion} from "./jait-llm.js";
afterEach(() => vi.unstubAllGlobals());
const llm = {backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "glm-5.2", contextWindow: 128000};
it("identifies Jait and sends its conversation ID on Go streaming requests", async () => {
  const fetcher = vi.fn(async () => new Response('data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {headers:{"content-type":"text/event-stream"}}));
  vi.stubGlobal("fetch", fetcher);
  const result = await runAgentLoop({llm, sessionId:"go-conversation", history:[{role:"user",content:"Check code"}], toolSchemas:[], hasTools:false, abort:new AbortController()}, async () => ({ok:true,message:"ok"}));
  expect(result.content).toBe("done");
  const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
  expect(headers.get("x-opencode-session")).toBe("go-conversation");
  expect(headers.get("user-agent")).toMatch(/^jait\//);
});
it("sends session metadata on auxiliary Go completions too", async () => {
  const fetcher=vi.fn(async () => new Response(JSON.stringify({choices:[{message:{content:"Title"}}]})));
  vi.stubGlobal("fetch",fetcher);
  await callJaitLlmCompletion(llm,[{role:"user",content:"Name the code change"}],{sessionId:"go-title"});
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("x-opencode-session")).toBe("go-title");
});
