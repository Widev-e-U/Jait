import { afterEach, expect, it, vi } from "vitest";
import { fetchJaitLlm, goRequest } from "./opencode-go-fetch.js";
import { callJaitLlmCompletion } from "./jait-llm.js";
import { runAgentLoop } from "../tools/agent-loop.js";
afterEach(() => vi.unstubAllGlobals());
const llm = { backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "claude-sonnet-4-6", contextWindow: 128000 };
const events = (items: unknown[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}});
for (const family of ["claude", "gpt"]) {
  it(`runs ${family} native streaming text and tool round trips through the actual agent loop`, async () => {
    const native = {...llm, openaiModel: family === "claude" ? "claude-sonnet-4-6" : "gpt-5.4"};
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => fetcher.mock.calls.length === 1
      ? events(family === "claude" ? [
        {type:"message_start",message:{usage:{input_tokens:4}}},
        {type:"content_block_start",index:0,content_block:{type:"tool_use",id:"call_1",name:"file_read",input:{}}},
        {type:"content_block_delta",index:0,delta:{type:"input_json_delta",partial_json:'{"path":"test.ts"}'}},
        {type:"message_delta",delta:{stop_reason:"tool_use"},usage:{output_tokens:3}}, {type:"message_stop"},
      ] : [
        {type:"response.output_item.added",output_index:1,item:{type:"function_call",call_id:"call_1",name:"file_read",arguments:""}},
        {type:"response.function_call_arguments.delta",output_index:1,delta:'{"path":"test.ts"}'},
        {type:"response.completed",response:{usage:{input_tokens:4,output_tokens:3}}},
      ])
      : events(family === "claude" ? [
        {type:"message_start",message:{usage:{input_tokens:8}}},
        {type:"content_block_delta",index:0,delta:{type:"text_delta",text:"Reviewed code."}},
        {type:"message_delta",delta:{stop_reason:"end_turn"},usage:{output_tokens:4}}, {type:"message_stop"},
      ] : [
        {type:"response.output_text.delta",delta:"Reviewed code."},
        {type:"response.completed",response:{usage:{input_tokens:8,output_tokens:4}}},
      ]));
    vi.stubGlobal("fetch",fetcher);
    const execute = vi.fn(async () => ({ok:true,message:"Source contents"}));
    const result = await runAgentLoop({llm:native,sessionId:"coding-session",history:[{role:"user",content:"Review test.ts"}],hasTools:true,toolSchemas:[{type:"function",function:{name:"file_read",description:"Read a file",parameters:{type:"object",properties:{path:{type:"string"}},required:["path"]}}}],abort:new AbortController()}, execute);
    expect(result.content).toBe("Reviewed code.");
    expect(execute).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![0]).toBe(`${llm.openaiBaseUrl}/${family === "claude" ? "messages" : "responses"}`);
    const next = JSON.parse(String(fetcher.mock.calls[1]![1]!.body));
    expect(JSON.stringify(next)).toContain("Source contents");
    expect(JSON.stringify(next)).toContain("call_1");
    expect(new Headers(fetcher.mock.calls[1]![1]!.headers).get("x-opencode-session")).toBe("coding-session");
  });
}
it("translates auxiliary native completions", async () => {
  vi.stubGlobal("fetch",vi.fn(async () => Response.json({content:[{type:"text",text:"Title"}],stop_reason:"end_turn",usage:{input_tokens:2,output_tokens:1}})));
  expect(await callJaitLlmCompletion(llm,[{role:"user",content:"Name the change"}])).toBe("Title");
});
it("keeps native HTTP errors and aborted requests visible", async () => {
  const abort = new AbortController(); abort.abort();
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => { expect(init?.signal).toBe(abort.signal); return Response.json({error:{message:"Invalid API key"}},{status:401}); });
  vi.stubGlobal("fetch",fetcher);
  const response = await fetchJaitLlm(llm,"unused",{body:JSON.stringify({model:llm.openaiModel,messages:[],stream:false}),signal:abort.signal});
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({error:{message:"Invalid API key"}});
});
it("preserves images and tool results in both native formats", () => {
  const body = {model:"test",messages:[{role:"system",content:"Review"},{role:"user",content:[{type:"image_url",image_url:{url:"data:image/png;base64,YQ=="}}]},{role:"assistant",content:"",tool_calls:[{id:"t1",function:{name:"read",arguments:'{"a":1}'}}]},{role:"tool",tool_call_id:"t1",content:"Found"}]};
  expect(goRequest(body,"messages").messages[0].content[0].source).toEqual({type:"base64",media_type:"image/png",data:"YQ=="});
  expect(goRequest(body,"responses").input.at(-1)).toEqual({type:"function_call_output",call_id:"t1",output:"Found"});
});

it("replays reasoning and unnamed tool results through Go chat completions", async () => {
  const native = { ...llm, openaiModel: "kimi-k2.5" };
  const thinking = "Read the source before answering.";
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => fetcher.mock.calls.length === 1
    ? events([
      { choices: [{ delta: { reasoning_content: thinking } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "file_read", arguments: '{"path":"test.ts"}' } }] }, finish_reason: "tool_calls" }] },
    ])
    : events([{ choices: [{ delta: { content: "Reviewed code." }, finish_reason: "stop" }] }]));
  vi.stubGlobal("fetch", fetcher);
  const execute = vi.fn(async () => ({ ok: true, message: "Source contents" }));
  const result = await runAgentLoop({
    llm: native, sessionId: "coding-session", history: [{ role: "user", content: "Review test.ts" }],
    hasTools: true, toolSchemas: [{ type: "function", function: { name: "file_read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
    abort: new AbortController(),
  }, execute);
  expect(result.content).toBe("Reviewed code.");
  expect(execute).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![0]).toBe(`${llm.openaiBaseUrl}/chat/completions`);
  const next = JSON.parse(String(fetcher.mock.calls[1]![1]!.body));
  const assistant = next.messages.find((m: { role: string }) => m.role === "assistant");
  expect(assistant.reasoning_content).toBe(thinking);
  expect(assistant).not.toHaveProperty("thinking");
  const tool = next.messages.find((m: { role: string }) => m.role === "tool");
  expect(tool.tool_call_id).toBe("call_1");
  expect(tool).not.toHaveProperty("name");
});
