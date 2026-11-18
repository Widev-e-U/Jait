/** Execute the real wait registry. Rust owns scenarios and differential verdicts. */
import {
  SessionWaitService, terminalWaitKey, browserWaitKey, backgroundWaitKey,
} from '../../../packages/gateway/src/services/session-waits.ts';
import { sessionWaitLabel, BLOCKING_SESSION_WAIT_KINDS } from '../../../packages/shared/src/types/message.ts';
export async function dispatch(call: any): Promise<unknown> {
  if (call.op === 'nativewaits.labels') return {
    labels: call.kinds.map(sessionWaitLabel), blocking: BLOCKING_SESSION_WAIT_KINDS,
    keys: call.ids.map((id: string) => [terminalWaitKey(id), browserWaitKey(id), backgroundWaitKey(id)]),
  };
  if (call.op !== 'nativewaits.sequence') throw new Error('unknown wait operation');
  const service = new SessionWaitService();
  const held = new Map();
  const changes: unknown[] = [];
  const results: unknown[] = [];
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
  const setObserver = (observer: any) => service.setBroadcaster(observer ? (change) => {
    changes.push(copy(change));
    if (observer.mutateLabel !== undefined && change.waits[0]) change.waits[0].label = observer.mutateLabel;
    if (observer.disable) service.setBroadcaster(undefined);
    if (observer.clearKey !== undefined) service.clear(observer.clearKey);
    if (observer.fail) throw new Error('delivery failed');
  } : undefined);
  setObserver({});
  for (const step of call.steps) {
    try {
      let value: unknown = null;
      switch (step.op) {
        case 'raise': {
          value = service.raise(step.input);
          if (step.hold) held.set(step.hold, value);
          break;
        }
        case 'clear': value = service.clear(step.key); break;
        case 'clearSession': service.clearSession(step.sessionId); break;
        case 'list': value = service.list(step.sessionId); break;
        case 'snapshot': value = service.snapshot(); break;
        case 'get': value = service.get(step.key); break;
        case 'held': value = held.get(step.id); break;
        case 'alias': value = held.get(step.id) === service.get(step.key); break;
        case 'mutate': Object.assign(held.get(step.id), step.patch); break;
        case 'observer': setObserver(step.observer); break;
        case 'reset': service.clearForTests(); break;
        default: throw new Error('unknown wait action');
      }
      results.push({ value: copy(value), snapshot: copy(service.snapshot()) });
    } catch (error) {
      results.push({ error: String(error instanceof Error ? error.message : error), snapshot: copy(service.snapshot()) });
    }
  }
  return { results, changes, snapshot: service.snapshot() };
}
