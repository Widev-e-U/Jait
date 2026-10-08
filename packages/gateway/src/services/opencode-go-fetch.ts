import { llmRequestHeaders } from "./llm-headers.js";

// Vendor payloads are translated at this boundary; the agent loop retains its
// existing OpenAI message/stream contract for every Go model family.
type Json = Record<string, any>;
type GoLlm = { backend?: string; openaiModel: string; openaiApiKey: string; openaiBaseUrl: string; sessionId?: string };
export function goProtocol(model: string): "messages" | "responses" | "chat/completions" {
  if (/^claude-/i.test(model)) return "messages";
  if (/^(gpt-|grok-|o\d)/i.test(model)) return "responses";
  return "chat/completions";
}
function isGo(llm: GoLlm): boolean {
  if (llm.backend === "opencode-go") return true;
  try { const url = new URL(llm.openaiBaseUrl); return url.hostname === "opencode.ai" && url.pathname.startsWith("/zen/go/"); }
  catch { return false; }
}
function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(p => p.type === "text").map(p => p.text || "").join("");
}
function parts(content: unknown, protocol: "messages" | "responses", role: string): Json[] {
  if (!Array.isArray(content)) return [{ type: protocol === "messages" ? "text" : role === "assistant" ? "output_text" : "input_text", text: text(content) }];
  return content.flatMap((p: Json): Json[] => {
    if (p.type === "text") return [{ type: protocol === "messages" ? "text" : role === "assistant" ? "output_text" : "input_text", text: p.text }];
    if (p.type !== "image_url") return [];
    const url = p.image_url?.url || "";
    if (protocol === "responses") return [{ type: "input_image", image_url: url }];
    const data = /^data:([^;]+);base64,(.*)$/s.exec(url);
    return [{ type: "image", source: data ? { type: "base64", media_type: data[1], data: data[2] } : { type: "url", url } }];
  });
}
export function goRequest(body: Json, protocol: "messages" | "responses"): Json {
  const messages: Json[] = body.messages ?? [];
  const tools: Json[] = body.tools ?? [];
  if (protocol === "responses") {
    const input = messages.flatMap((m): Json[] => {
      if (m.role === "tool") return [{ type: "function_call_output", call_id: m.tool_call_id, output: text(m.content) }];
      const items: Json[] = [];
      if (text(m.content) || Array.isArray(m.content)) items.push({ role: m.role, content: parts(m.content, protocol, m.role) });
      for (const call of m.tool_calls ?? []) items.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
      return items;
    });
    return { model: body.model, input, stream: body.stream, store: false,
      ...(body.max_tokens ? { max_output_tokens: body.max_tokens } : {}),
      ...(body.reasoning_effort ? { reasoning: { effort: body.reasoning_effort } } : {}),
      ...(tools.length ? { tools: tools.map(t => ({ type: "function", ...t.function })), tool_choice: body.tool_choice ?? "auto" } : {}),
    };
  }
  const translated: Json[] = [];
  for (const m of messages.filter(m => m.role !== "system" && m.role !== "developer")) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = m.role === "tool"
      ? [{ type: "tool_result", tool_use_id: m.tool_call_id, content: text(m.content) }]
      : parts(m.content, protocol, m.role).filter(p => p.type !== "text" || p.text);
    for (const call of m.tool_calls ?? []) content.push({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || "{}") });
    if (!content.length) continue;
    const previous = translated.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else translated.push({ role, content });
  }
  return { model: body.model, messages: translated, stream: body.stream, max_tokens: body.max_tokens ?? 8192,
    system: messages.filter(m => m.role === "system" || m.role === "developer").map(m => text(m.content)).join("\n\n"),
    ...(tools.length ? { tools: tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })), tool_choice: { type: "auto" } } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
  };
}
function usage(u: Json = {}, protocol: string): Json {
  const prompt = (u.input_tokens ?? 0) + (protocol === "messages" ? (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : 0);
  const completion = u.output_tokens ?? 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}
function finish(reason: string): string {
  return reason === "tool_use" ? "tool_calls" : reason === "max_tokens" || reason === "incomplete" ? "length" : "stop";
}
function completion(data: Json, protocol: "messages" | "responses"): Json {
  const blocks: Json[] = protocol === "messages" ? data.content ?? [] : data.output ?? [];
  const content = protocol === "messages" ? blocks.filter(b => b.type === "text").map(b => b.text).join("") : blocks.flatMap(b => b.content ?? []).filter(b => b.type === "output_text").map(b => b.text).join("");
  const calls = blocks.filter(b => b.type === "tool_use" || b.type === "function_call").map(b => ({ id: b.call_id ?? b.id, type: "function", function: { name: b.name, arguments: b.arguments ?? JSON.stringify(b.input) } }));
  return { choices: [{ message: { role: "assistant", content, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: calls.length ? "tool_calls" : finish(data.stop_reason ?? data.status) }], usage: usage(data.usage, protocol) };
}
/** Convert incrementally, preserving cancellation and network backpressure. */
function streamResponse(response: Response, protocol: "messages" | "responses"): Response {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const indices = new Map<string | number, number>();
  let buffer = "", ended = false, toolCount = 0;
  let totals: Json = {};
  function convert(e: Json): Json | undefined {
    let delta: Json = {};
    let reason: string | undefined;
    if (e.type === "error" || e.type === "response.failed") throw new Error(e.error?.message ?? e.response?.error?.message ?? "Go stream failed");
    if (protocol === "messages") {
      if (e.type === "message_start") totals = { ...e.message?.usage };
      if (e.type === "content_block_start") {
        const b = e.content_block;
        if (b?.type === "tool_use") { const index = toolCount++; indices.set(e.index, index); delta.tool_calls = [{ index, id: b.id, type: "function", function: { name: b.name, arguments: "" } }]; }
        if (b?.type === "text" && b.text) delta.content = b.text;
        if (b?.type === "thinking" && b.thinking) delta.reasoning_content = b.thinking;
      }
      if (e.type === "content_block_delta") {
        if (e.delta?.type === "text_delta") delta.content = e.delta.text;
        if (e.delta?.type === "thinking_delta") delta.reasoning_content = e.delta.thinking;
        if (e.delta?.type === "input_json_delta") delta.tool_calls = [{ index: indices.get(e.index), function: { arguments: e.delta.partial_json } }];
      }
      if (e.type === "message_delta") { totals = { ...totals, ...e.usage }; reason = finish(e.delta?.stop_reason); }
      if (e.type === "message_stop") ended = true;
    } else {
      if (e.type === "response.output_text.delta") delta.content = e.delta;
      if (e.type === "response.reasoning_summary_text.delta" || e.type === "response.reasoning_text.delta") delta.reasoning_content = e.delta;
      if (e.type === "response.output_item.added" && e.item?.type === "function_call") {
        const index = toolCount++; indices.set(e.output_index, index);
        delta.tool_calls = [{ index, id: e.item.call_id, type: "function", function: { name: e.item.name, arguments: e.item.arguments ?? "" } }];
      }
      if (e.type === "response.function_call_arguments.delta") delta.tool_calls = [{ index: indices.get(e.output_index), function: { arguments: e.delta } }];
      if (e.type === "response.completed" || e.type === "response.incomplete") { totals = e.response?.usage ?? {}; reason = e.type === "response.incomplete" ? "length" : toolCount ? "tool_calls" : "stop"; ended = true; }
    }
    if (!Object.keys(delta).length && !reason) return undefined;
    return { choices: [{ index: 0, delta, finish_reason: reason ?? null }], ...(reason ? { usage: usage(totals, protocol) } : {}) };
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let emitted = false;
        while (!emitted) {
          const split = buffer.indexOf("\n\n");
          if (split >= 0) {
            const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
            const data = frame.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
            if (!data || data === "[DONE]") continue;
            const chunk = convert(JSON.parse(data));
            if (chunk) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)); emitted = true; }
            if (ended) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); await reader.cancel(); return; }
          } else {
            const next = await reader.read();
            if (next.done) { if (!ended) throw new Error("Go stream ended before completion"); controller.close(); return; }
            buffer += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, "\n");
          }
        }
      } catch (error) { controller.error(error); await reader.cancel().catch(() => {}); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { status: response.status, headers: { "content-type": "text/event-stream" } });
}
export async function fetchJaitLlm(llm: GoLlm, url: string, init: RequestInit): Promise<Response> {
  const protocol = isGo(llm) ? goProtocol(llm.openaiModel) : "chat/completions";
  if (protocol === "chat/completions") return fetch(url, init);
  const body = goRequest(JSON.parse(String(init.body)), protocol);
  const headers = new Headers(init.headers ?? llmRequestHeaders(llm));
  if (protocol === "messages") { headers.set("x-api-key", llm.openaiApiKey); headers.set("anthropic-version", "2023-06-01"); }
  const response = await fetch(`${llm.openaiBaseUrl.replace(/\/+$/, "")}/${protocol}`, { ...init, headers, body: JSON.stringify(body) });
  if (!response.ok) return response;
  if (body.stream && response.body) return streamResponse(response, protocol);
  return Response.json(completion(await response.json() as Json, protocol));
}
