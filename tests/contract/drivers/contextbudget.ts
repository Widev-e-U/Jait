import { compactProviderContext } from "../../../packages/gateway/src/providers/context-control.ts";
/** Rust owns vectors and assertions; this bridge calls the production implementation. */
import * as policy from '../../../packages/gateway/src/services/context-budget.ts';
import { applyContextCaching } from '../../../packages/gateway/src/services/context-cache.ts';
import { ContextEvidence } from '../../../packages/gateway/src/tools/context-evidence.ts';
export async function dispatch(call: any): Promise<any> {
  const budget = policy.contextBudget(call.budget);
  switch (call.op) {
    case 'contextbudget.metadata': {
      const { createContextReadTool } = await import('../../../packages/gateway/src/tools/context-evidence.ts');
      const { execute, ...metadata } = createContextReadTool(); return metadata;
    }
    case 'contextbudget.persistent': {
      const { openDatabase } = await import('../../../packages/gateway/src/db/index.ts');
      const { SessionStateService } = await import('../../../packages/gateway/src/services/session-state.ts');
      const { configureContextEvidence, saveContextState, loadContextState } = await import('../../../packages/gateway/src/tools/context-evidence.ts');
      const { db, sqlite } = await openDatabase(':memory:');
      sqlite.exec('CREATE TABLE session_state (session_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(session_id,key))');
      const state = new SessionStateService(db); const scope = { sessionId: 'persisted', userId: 'owner' };
      let store = new ContextEvidence(state, () => 1000);
      const projected = store.project({ ok: true, message: 'saved', data: { output: 'detail '.repeat(2000) } }, scope);
      store = new ContextEvidence(new SessionStateService(db), () => 1000);
      const page = store.read(scope, projected.reference!, 0, 2000);
      configureContextEvidence(state); saveContextState(scope, { anchor: 'fingerprint', lastAttempt: 1000 });
      const restored = loadContextState(scope); const denied = loadContextState({ ...scope, userId: 'other' }) ?? null;
      sqlite.close(); return { projected, page, restored, denied };
    }
    case 'contextbudget.defaults': return budget;
    case 'contextbudget.config': return policy.contextBudgetFromJson(call.text);
    case 'contextbudget.summary': return policy.boundSummaryInput(call.text, call.window);
    case 'contextbudget.anchor': {
      const anchor = policy.captureUsageAnchor(call.base, call.identity, call.input, call.output);
      return { anchor: anchor ?? null, projected: policy.estimateAnchoredContext(call.messages, call.nextIdentity ?? call.identity, anchor, call.fallback ?? 123) };
    }
    case 'contextbudget.prune': return policy.pruneToolContext(call.messages, budget);
    case 'contextbudget.plan': return policy.compactionPlan(call.input, budget);
    case 'contextbudget.commit': return policy.shouldCommitCompaction(call.before, call.after, budget);
    case 'contextbudget.price': return policy.priceTokenUsage(call.usage, call.prices) ?? null;
    case 'contextbudget.cache': {
      const body = structuredClone(call.body); applyContextCaching(body, call.route, budget); return body;
    }
    case 'contextbudget.pipeline': {
      const { runAgentLoop, toolDefsToSchemas } = await import('../../../packages/gateway/src/tools/agent-loop.ts');
      const { configureContextEvidence, createContextReadTool } = await import('../../../packages/gateway/src/tools/context-evidence.ts');
      const { handleMcpRequest, listToolsForMcp } = await import('../../../packages/gateway/src/routes/mcp-server.ts');
      const { ToolRegistry } = await import('../../../packages/gateway/src/tools/registry.ts');
      const state = new Map<string, Record<string, unknown>>();
      configureContextEvidence({ get: session => state.get(session) ?? {}, set: (session, entries) => state.set(session, { ...state.get(session), ...structuredClone(entries) }) });
      const scope = { sessionId: 'pipeline', userId: 'owner' };
      const result = { ok: true, message: 'evidence', data: { output: 'detail '.repeat(3000), exitCode: 0 } };
      const before = JSON.stringify(result);
      const history: any[] = [{ role: 'user', content: 'inspect' }];
      const rounds: any[] = []; let requests = 0;
      const original = globalThis.fetch;
      globalThis.fetch = (async () => {
        const first = requests++ === 0;
        const delta = first ? { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'evidence', arguments: '{}' } }] } : { content: 'done' };
        const usage = { prompt_tokens: first ? 500 : 2000, completion_tokens: first ? 30 : 10,
          prompt_tokens_details: { cached_tokens: first ? 200 : 500, cache_write_tokens: 0 } };
        return new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: first ? 'tool_calls' : 'stop' }], usage })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
      }) as typeof fetch;
      try {
        await runAgentLoop({ llm: { openaiApiKey: 'fixture', openaiBaseUrl: 'https://fixture.invalid/v1', openaiModel: 'fixture', backend: 'openai', contextWindow: 128000,
          tokenPrices: { input: 2, cachedInput: 0.1, cacheWrite: 2.5, output: 10, currency: 'USD' } }, history,
          toolSchemas: [{ type: 'function', function: { name: 'evidence', description: 'read evidence', parameters: { type: 'object', properties: {} } } }], hasTools: true,
          sessionId: scope.sessionId, auth: { userId: scope.userId }, abort: new AbortController(), maxRounds: 3,
          onContext: round => rounds.push(round), log: { info() {}, warn() {}, error() {} } }, async () => result);
      } finally { globalThis.fetch = original; }
      const projected = history.find(message => message.role === 'tool');
      const reference = JSON.parse(projected.content).contextEvidence.reference;
      const recoveryHistory: any[] = [{ role: 'user', content: 'recover evidence' }];
      let recoveryRequests = 0;
      globalThis.fetch = (async () => {
        const first = recoveryRequests++ === 0;
        const delta = first ? { tool_calls: [{ index: 0, id: 'read-1', type: 'function', function: { name: 'context_read', arguments: JSON.stringify({ reference, limit: 8000 }) } }] } : { content: 'recovered' };
        return new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: first ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
      }) as typeof fetch;
      try {
        await runAgentLoop({ llm: { openaiApiKey: 'fixture', openaiBaseUrl: 'https://fixture.invalid/v1', openaiModel: 'fixture', backend: 'openai', contextWindow: 128000 }, history: recoveryHistory,
          toolSchemas: toolDefsToSchemas([createContextReadTool()]), hasTools: true,
          sessionId: scope.sessionId, auth: { userId: scope.userId }, abort: new AbortController(), maxRounds: 3,
          log: { info() {}, warn() {}, error() {} } }, async (_name, args) => createContextReadTool().execute(args as any, { ...scope, actionId: 'recovery', projectRoot: '.', requestedBy: 'contract' }));
      } finally { globalThis.fetch = original; }
      const loopPage = JSON.parse(recoveryHistory.find(message => message.role === 'tool').content).data;
      const registry = new ToolRegistry(); registry.register(createContextReadTool());
      const request = { jsonrpc: '2.0' as const, id: 1, method: 'tools/call', params: { name: 'context_read', arguments: { reference, limit: 8000 } } };
      const response: any = await handleMcpRequest(request, registry, undefined, scope);
      const page = JSON.parse(response.result.content[0].text).data;
      const denied: any = await handleMcpRequest(request, registry, undefined, { ...scope, userId: 'other' });
      return { requests, loopRecovered: loopPage.content.length === 8000 && loopPage.nextOffset === 8000, bounded: projected.content.length <= 8000, recovered: page.content.length === 8000 && page.hasMore,
        denied: denied.result.isError, deferred: listToolsForMcp(registry, 'core').every(tool => tool.name !== 'context.read'),
        unchanged: before === JSON.stringify(result), costs: rounds.map(round => round.metrics.cost),
        actualUsage: rounds.map(round => round.metrics.promptTokens) };
    }
    case 'contextbudget.native': {
      const state = structuredClone(call.state); const commands: string[] = []; let error = false;
      try { await compactProviderContext(state, async command => { commands.push(command); if (call.fail) throw new Error('provider failure'); }, call.now ?? 100000); } catch { error = true; }
      return { state, commands, error };
    }
    case 'contextbudget.evidence': {
      let now = call.now ?? 1000;
      let state: Record<string, unknown> = {};
      const backing = { get: () => structuredClone(state), set: (_: string, entries: Record<string, unknown>) => { state = structuredClone(entries); } };
      let store = new ContextEvidence(backing, () => now);
      const projected = store.project(call.result, call.scope, budget.toolResultChars, call.toolName);
      const before = store.read(call.scope, projected.reference ?? '', call.offset, call.limit, call.query);
      store = new ContextEvidence(backing, () => now); // actual persisted reload
      const restored = store.read(call.scope, projected.reference ?? '', call.offset, call.limit, call.query);
      const denied = store.read({ ...call.scope, userId: 'other' }, projected.reference ?? '');
      now += 86_400_001;
      const expired = store.read(call.scope, projected.reference ?? '');
      return { projected, before, restored, denied, expired, unchanged: JSON.stringify(call.result) };
    }
    default: throw new Error('unknown context budget operation');
  }
}
