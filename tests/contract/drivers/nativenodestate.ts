/** Only the clock is controlled; all state transitions and sorting use real exports. */
import { NodeStateManager } from '../../../packages/gateway/src/services/node-state-manager.ts';
export async function dispatch(call: any): Promise<any> {
  if (call.op !== 'nativenodestate.trace') throw new Error('unknown operation');
  const OriginalDate = globalThis.Date;
  let next = call.epoch ?? 1700000000000;
  let ticks = 0;
  globalThis.Date = class extends OriginalDate {
    constructor(...args: any[]) {
      if (args.length) super(args[0]);
      else { super(next++); ticks++; }
    }
  } as any;
  try {
    const manager = new NodeStateManager();
    const results = [];
    for (const step of call.steps) {
      switch (step.action) {
        case 'upsert': results.push(manager.upsertNode(step.input)); break;
        case 'remove': results.push(manager.removeNode(step.id)); break;
        case 'removeClient': results.push(manager.removeNodesByClientId(step.clientId)); break;
        case 'get': results.push(manager.getNode(step.id)); break;
        case 'client': results.push(manager.getClientId(step.id)); break;
        case 'list': results.push(manager.listNodes()); break;
        case 'snapshot': results.push(manager.getSnapshot()); break;
        default: throw new Error('unknown step');
      }
    }
    return { results, ticks };
  } finally { globalThis.Date = OriginalDate; }
}
