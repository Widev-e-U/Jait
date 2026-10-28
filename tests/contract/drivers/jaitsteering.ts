/** Rust owns inputs/assertions; exercise the real native provider and loop.
 * Only the model transport is replaced, with deterministic stream/tool barriers.
 */
import { JaitProvider } from '../../../packages/gateway/src/providers/jait-provider.ts';
import { ToolRegistry } from '../../../packages/gateway/src/tools/registry.ts';
import type { AppConfig } from '../../../packages/gateway/src/config.ts';
import type { ThreadService } from '../../../packages/gateway/src/services/threads.ts';
import type { ProviderEvent } from '../../../packages/gateway/src/providers/contracts.ts';

function gate() {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { ready, release };
}
export async function dispatch(call: any) {
  if (call.op !== 'jaitsteering.provider') throw new Error('unknown native steering operation');
  const firstRequest = gate(), releaseModel = gate(), toolStarted = gate(), releaseTool = gate();
  const requests: any[] = [], events: ProviderEvent[] = [], order: string[] = [];
  const originalFetch = globalThis.fetch, originalLog = console.log, originalInfo = console.info;
  console.log = console.info = (...args) => console.error(...args);
  const encode = (delta: unknown, finish?: string) => new TextEncoder().encode(
    `data: ${JSON.stringify({ choices: [{ delta, ...(finish ? { finish_reason: finish } : {}) }] })}\n\n`);
  globalThis.fetch = (async (_url, init) => {
    const index = requests.length;
    requests.push(JSON.parse(String(init?.body)));
    order.push('request-' + index);
    if (index > 2) throw new Error('unexpected model request');
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        const finish = () => { controller.enqueue(encode({}, 'stop')); controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); };
        if (index === 0 && call.phase === 'tool') {
          controller.enqueue(encode({ tool_calls: [{ index: 0, id: 'probe-call', type: 'function', function: { name: 'contract_probe', arguments: '{}' } }] }));
          finish();
        } else if (index === 0) {
          controller.enqueue(encode({ content: 'Initial answer.' }));
          void releaseModel.ready.then(finish);
        } else {
          controller.enqueue(encode({ content: 'Updated answer.' }));
          finish();
        }
        firstRequest.release();
      },
    }), { headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  const registry = new ToolRegistry();
  registry.register({ name: 'contract.probe', description: 'Read-only contract probe', tier: 'core', parameters: { type: 'object', properties: {} },
    execute: async () => ({ ok: true, message: 'unused' }) });
  const provider = new JaitProvider({
    config: { openaiApiKey: 'fixture', openaiBaseUrl: 'https://fixture.invalid/v1', openaiModel: 'fixture-model', agentMaxRounds: 0 } as AppConfig,
    threadService: { getById: () => undefined } as unknown as ThreadService,
    toolRegistry: call.phase === 'tool' ? registry : undefined,
    toolExecutor: async () => {
      order.push('tool-start'); toolStarted.release();
      await releaseTool.ready;
      order.push('tool-end');
      return { ok: true, message: 'probe evidence' };
    },
  });
  provider.onEvent(event => { events.push(event); if (event.type === 'activity' && event.kind === 'steering') order.push('consumed'); });
  let running: Promise<void> | undefined;
  try {
    const session = await provider.startSession({ threadId: 'contract-thread', workingDirectory: import.meta.dir, mode: 'full-access' });
    const idle = await provider.steerTurn(session.id, call.messages[0]);
    running = provider.sendTurn(session.id, 'Original task');
    await (call.phase === 'tool' ? toolStarted.ready : firstRequest.ready);
    const turnId = events.find(event => event.type === 'turn.started')?.turnId;
    if (!turnId) throw new Error('native turn did not expose an id');
    const stale = await provider.steerTurn(session.id, 'stale guidance', 'old-turn');
    const empty = await provider.steerTurn(session.id, '  ', turnId);
    const accepted = [];
    for (const message of call.messages) accepted.push(await provider.steerTurn(session.id, message, turnId));
    const beforeRelease = { requests: requests.length, consumed: order.filter(item => item === 'consumed').length };
    if (call.cancel) await provider.interruptTurn(session.id);
    const afterCancel = call.cancel ? await provider.steerTurn(session.id, 'after cancellation', turnId) : undefined;
    releaseModel.release(); releaseTool.release();
    await running;
    const afterCompletion = await provider.steerTurn(session.id, 'too late', turnId);
    // An old id must also fail during the next turn, without leaking prior input.
    let staleNext: Promise<boolean> | undefined;
    provider.onEvent(event => { if (event.type === 'turn.started') staleNext = provider.steerTurn(session.id, 'stale next-turn guidance', turnId); });
    await provider.sendTurn(session.id, 'Next task');
    const staleDuringNext = await staleNext;
    return { idle, stale, empty, staleDuringNext, accepted, beforeRelease, afterCancel, afterCompletion, requests, events, order };
  } finally {
    releaseModel.release(); releaseTool.release();
    await running?.catch(() => {});
    await provider.dispose();
    globalThis.fetch = originalFetch; console.log = originalLog; console.info = originalInfo;
  }
}
