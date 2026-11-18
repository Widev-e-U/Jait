/** Test-only transport. Rust owns inputs and expected behavior; no real model calls. */
import { compactActiveTurnHistory, generateLLMConversationSummary, pruneHistory, runAgentLoop, toolDefsToSchemas, type AgentMessage } from '../../../packages/gateway/src/tools/agent-loop.ts';

export async function dispatch(call: any): Promise<unknown> {
  const history: AgentMessage[] = structuredClone(call.history ?? []);
  const requests: any[] = [];
  const abort = new AbortController();
  const originalFetch = globalThis.fetch;
  const llm = { backend: call.backend ?? 'ollama', openaiApiKey: 'fixture', openaiModel: 'fixture', openaiBaseUrl: 'http://fixture.invalid/v1', contextWindow: call.contextWindow ?? 2000 };
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (!body.stream) {
      if (call.cancel) { abort.abort(); throw new DOMException('cancelled', 'AbortError'); }
      if (call.fail) return new Response('unavailable', { status: 503 });
      // Models with a small output limit reject an oversized budget instead of clamping it.
      if (typeof call.rejectBudget === 'number' && (body.max_tokens ?? body.options?.num_predict) > call.rejectBudget) {
        return new Response('budget above model output limit', { status: 400 });
      }
      return Response.json(llm.backend === 'ollama'
        ? { message: { content: call.summary }, done_reason: call.truncated ? 'length' : 'stop' }
        : { choices: [{ message: { content: call.summary }, finish_reason: call.truncated ? 'length' : 'stop' }] });
    }
    return new Response(JSON.stringify({ message: { content: 'Resumed from checkpoint.' }, done: true }) + '\n');
  }) as typeof fetch;
  try {
    if (call.op === 'compaction.active-turn') {
      let source: AgentMessage[] = [];
      const duringSummary: AgentMessage[][] = [];
      const changed = await compactActiveTurnHistory(history, [], call.limit, {
        summaryGenerator: async removed => {
          source = removed;
          // Capture before returning, so Rust checks the original callback-time assertion.
          duringSummary.push(structuredClone(history));
          return call.summary;
        },
      });
      return { changed, history, source, duringSummary };
    }
    if (call.op === 'compaction.summary') {
      const summary = await generateLLMConversationSummary(history, llm, abort.signal);
      return { summary, requests };
    }
    if (call.op === 'compaction.prune') {
      const changes = [];
      for (const additions of call.passes ?? [[]]) {
        history.push(...additions);
        changes.push(await pruneHistory(history, llm.contextWindow, [], { summaryGenerator: removed => generateLLMConversationSummary(removed, llm, abort.signal) }));
      }
      return { history, changes, requests };
    }
    if (call.op === 'compaction.run') {
      const tools = toolDefsToSchemas([{ name: 'fixture.read', description: 'Read fixture', parameters: { type: 'object', properties: {} } }]);
      const result = await runAgentLoop({ llm, history, toolSchemas: tools, hasTools: true, sessionId: 'compaction-contract', abort, maxRounds: 1, continuous: false, maxRetries: 0, log: { info() {}, warn() {}, error() {} } }, async () => { throw new Error('fixture must not execute tools'); });
      return { history, result, requests };
    }
    throw new Error('unknown compaction operation');
  } catch (error) {
    return { history, requests, error: error instanceof Error ? error.message : String(error) };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
