/** Actual dispatcher/controller policy, isolated from provider, credentials and network. */
import { createHash } from 'node:crypto';
let factory: Promise<any> | undefined;
async function load() {
  return factory ??= (async () => {
    const controller = await Bun.file(new URL('../../../packages/gateway/src/tools/agent-loop.ts', import.meta.url)).text();
    const start = controller.indexOf('export interface SteeringMessageMeta {');
    const end = controller.indexOf('// ── Tool call queue', start);
    if (start < 0 || end < start) throw Error('Steering controller source boundary changed');
    let dispatcher = await Bun.file(new URL('../../../packages/gateway/src/providers/steering-dispatcher.ts', import.meta.url)).text();
    const binding = 'import type { SteeringController, SteeringMessage } from "../tools/agent-loop.js";';
    if (dispatcher.split(binding).length !== 2) throw Error('Steering dispatcher binding changed');
    dispatcher = dispatcher.replace(binding, '');
    const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(controller.slice(start, end) + '\n' + dispatcher);
    const path = new URL('../../../.jait/artifacts/gateway-rust/steering-dispatcher/fixtures/' + createHash('sha256').update(code).digest('hex') + '.mjs', import.meta.url);
    await Bun.write(path, code);
    return import(path.href);
  })();
}
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const errorValue = (error: any) => error instanceof Error ? { error: error.message } : { thrown: error };
export async function dispatch(call: any) {
  const { SteeringController, ProviderSteeringDispatcher } = await load();
  const results = [];
  for (const test of call.cases) {
    const queue = new SteeringController(), events: any[] = [], pauses: any[] = [], snapshots: any[] = [];
    const held: any[] = []; let next = 0;
    const deliver = (message: string) => {
      events.push({ deliver: message });
      const response = test.responses?.[next++] ?? true;
      if (response === 'hold') return new Promise<boolean>((resolve, reject) => held.push({ resolve, reject }));
      if (response && typeof response === 'object') return Promise.reject('error' in response ? Error(response.error) : response.thrown);
      return Promise.resolve(response);
    };
    const dispatcher = new ProviderSteeringDispatcher(queue, deliver,
      (message: any) => { events.push({ consumed: structuredClone(message) }); },
      (error: any) => { events.push({ failed: errorValue(error) }); });
    for (const action of test.actions) {
      switch (action.op) {
        case 'enqueue': queue.steer(action.message ?? '', action.meta); break;
        case 'start': dispatcher.start(); break;
        case 'pause': {
          const index = pauses.push('pending') - 1;
          dispatcher.pause().then(() => { pauses[index] = 'ok'; }, (error: any) => { pauses[index] = errorValue(error); });
          break;
        }
        case 'dispose': dispatcher.dispose(); break;
        case 'resolve': held[action.index ?? 0].resolve(action.value ?? true); break;
        case 'reject': held[action.index ?? 0].reject('error' in action ? Error(action.error) : action.thrown); break;
        case 'drain': events.push({ drained: queue.drain() }); break;
        case 'flush': await flush(); break;
        default: throw Error('Unknown steering action');
      }
      snapshots.push({ events: structuredClone(events), pending: structuredClone(queue.queue), pauses: structuredClone(pauses), listeners: queue.pendingListeners.size });
    }
    dispatcher.dispose();
    for (const pending of held) pending.resolve(false);
    await flush();
    results.push(snapshots);
  }
  return results;
}
