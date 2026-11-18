/** Rust supplies protocol fixtures and expected results; this adapter observes production code. */
import { buildSystemPrompt, getReminderInstructions, promptRegistry } from '../../../packages/gateway/src/tools/prompts/index.ts';
import { runAgentLoop, toolDefsToSchemas, type AgentLoopEvent, type AgentMessage } from '../../../packages/gateway/src/tools/agent-loop.ts';

export async function dispatch(call: any): Promise<unknown> {
  if (call.op === 'agentloop.prompt') {
    return {
      resolver: promptRegistry.resolve(call.endpoint).name,
      prompt: buildSystemPrompt(call.mode ?? 'agent', call.endpoint, call.context),
      reminder: getReminderInstructions(call.mode ?? 'agent', call.endpoint),
    };
  }
  if (call.op !== 'agentloop.run') throw new Error('unknown agent loop operation');
  const encoder = new TextEncoder();
  const requests: any[] = [];
  const events: AgentLoopEvent[] = [];
  const execution: string[] = [];
  let active = 0;
  let peak = 0;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 5000);
  const networkFetch = globalThis.fetch;
  const backend = call.backend ?? 'ollama';
  const model = call.model ?? 'deepseek-v4.1-flash:cloud';
  const baseUrl = 'http://fixture.invalid/v1';
  const endpoint = { model, backend, baseUrl };
  const history: AgentMessage[] = [
    { role: 'system', content: buildSystemPrompt('agent', endpoint, { backend }) },
    { role: 'user', content: 'Inspect the supplied fixture targets and report the result.' },
  ];
  const names: string[] = [...new Set<string>(call.rounds.flatMap((round: any) => (round.calls ?? []).map((tool: any) => tool.name)))];
  const schemas = toolDefsToSchemas(names.map(name => ({
    name, description: 'Deterministic contract fixture',
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'], additionalProperties: false },
  })));
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ url: String(input), body });
    const round = call.rounds[requests.length - 1];
    if (!round) throw new Error('fixture has no further model response');
    const tools = (round.calls ?? []).map((tool: any, index: number) => ({
      id: tool.id ?? `call-${requests.length}-${index}`, type: 'function',
      function: { name: tool.name.replaceAll('.', '_'), arguments: backend === 'ollama' ? tool.args : JSON.stringify(tool.args) },
    }));
    const chunks: string[] = [];
    if (backend === 'ollama') {
      if (round.thinking) chunks.push(JSON.stringify({ message: { role: 'assistant', thinking: round.thinking } }) + '\n');
      if (round.text) chunks.push(JSON.stringify({ message: { role: 'assistant', content: round.text } }) + '\n');
      if (tools.length) chunks.push(JSON.stringify({ message: { role: 'assistant', tool_calls: tools } }) + '\n');
      if (!round.truncated) chunks.push(JSON.stringify({ done: true, done_reason: 'stop' }) + '\n');
    } else {
      const send = (delta: unknown, finish_reason: string | null = null) => chunks.push(`data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`);
      if (round.thinking) send({ reasoning_content: round.thinking });
      if (round.text) send({ content: round.text });
      if (tools.length) send({ tool_calls: tools.map((tool: any, index: number) => ({ index, ...tool })) });
      send({}, tools.length ? 'tool_calls' : 'stop');
      chunks.push('data: [DONE]\n\n');
    }
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        // Deliberately fragment every UTF-8 code point and frame boundary.
        for (const byte of encoder.encode(chunks.join(''))) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }));
  }) as typeof fetch;
  try {
    if (call.abortBefore) abort.abort();
    const result = await runAgentLoop({
      llm: { backend, openaiApiKey: 'fixture', openaiBaseUrl: baseUrl, openaiModel: model, contextWindow: 100_000 },
      history, toolSchemas: schemas, hasTools: schemas.length > 0, sessionId: 'agent-loop-contract',
      abort, maxRounds: 8, continuous: false, maxRetries: 0,
      ...(call.parallel === undefined ? {} : { parallel: call.parallel }),
      onEvent: event => events.push(event),
      log: { info() {}, warn() {}, error() {} },
    }, async (name, args: any) => {
      execution.push(`start:${name}:${args.key}`);
      peak = Math.max(peak, ++active);
      try {
        // Yield deterministically: a serialized executor cannot reach peak=2.
        await Promise.resolve();
        if (args.key === call.throwKey) throw new Error('fixture tool failure');
        return { ok: true, message: `observed:${args.key}` };
      } finally {
        active--;
        execution.push(`end:${name}:${args.key}`);
      }
    });
    return {
      requests, execution, peak, history,
      result: { content: result.content, rounds: result.rounds, aborted: result.aborted, hitMaxRounds: result.hitMaxRounds, tools: result.executedToolCalls.map(tool => ({ tool: tool.tool, ok: tool.ok, message: tool.message })) },
      events: events.filter(event => ['token', 'thinking', 'tool_start', 'tool_result', 'error'].includes(event.type)).map(event => ({ ...event, ...('call_id' in event ? { call_id: undefined } : {}) })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), requests, execution, peak, history };
  } finally {
    clearTimeout(deadline);
    globalThis.fetch = networkFetch;
  }
}
