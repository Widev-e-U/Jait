import { describe, expect, it } from "vitest";
import { parseOpenAIStream } from "./agent-loop.js";

function reader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }).getReader();
}

const DONE = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n';

describe("streamed tool-call slot resolution", () => {
  it("keeps calls separate when the backend omits `index`", async () => {
    // Plenty of OpenAI-compatible backends stream tool calls without `index`.
    // Defaulting them all to slot 0 concatenated the names into one garbage
    // identifier and made the arguments unparseable.
    const parsed = await parseOpenAIStream(reader([
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"c1","type":"function","function":{"name":"search","arguments":"{\\"q\\":1}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"c2","type":"function","function":{"name":"web_fetch","arguments":"{\\"url\\":\\"x\\"}"}}]}}]}\n\n',
      DONE,
    ]));

    expect(parsed.toolCalls.map((tc) => tc.function.name)).toEqual(["search", "web_fetch"]);
    expect(parsed.toolCalls.map((tc) => tc.function.arguments)).toEqual(['{"q":1}', '{"url":"x"}']);
  });

  it("still assembles name and argument fragments of one call", async () => {
    const parsed = await parseOpenAIStream(reader([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"file_","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"read","arguments":"{\\"pa"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"a.ts\\"}"}}]}}]}\n\n',
      DONE,
    ]));

    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]!.function.name).toBe("file_read");
    expect(parsed.toolCalls[0]!.function.arguments).toBe('{"path":"a.ts"}');
  });

  it("handles the standard indexed multi-call stream unchanged", async () => {
    const parsed = await parseOpenAIStream(reader([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"agent","arguments":"{\\"r\\":\\"dev\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"c2","type":"function","function":{"name":"agent","arguments":"{\\"r\\":\\"qa\\"}"}}]}}]}\n\n',
      DONE,
    ]));

    expect(parsed.toolCalls.map((tc) => tc.id)).toEqual(["c1", "c2"]);
    expect(parsed.toolCalls.map((tc) => tc.function.arguments)).toEqual(['{"r":"dev"}', '{"r":"qa"}']);
  });

  it("separates calls when a backend reuses index 0 for every call", async () => {
    const parsed = await parseOpenAIStream(reader([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"read","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c2","type":"function","function":{"name":"execute","arguments":"{}"}}]}}]}\n\n',
      DONE,
    ]));

    expect(parsed.toolCalls.map((tc) => tc.function.name)).toEqual(["read", "execute"]);
  });
});
