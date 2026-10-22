/** Actual tool factories and shared Zod schema; bridge effects alone are scripted. */
import { createMessengerTools } from '../../../packages/gateway/src/tools/messenger-tools.ts';
export async function dispatch(call: any) {
  if (call.op === 'nativemessengertools.metadata') {
    return createMessengerTools({} as any).map(({ execute, ...metadata }) => metadata);
  }
  const results = [];
  for (const test of call.cases) {
    const events: any[] = [];
    const controller = new AbortController();
    if (test.aborted) controller.abort();
    const context = { userId: 'owner', ...test.context, ...(test.noSignal ? {} : { signal: controller.signal }) };
    if (test.noUser) delete context.userId;
    const tools = createMessengerTools({ request(userId: any, command: any, signal: any) {
      events.push({ args: [userId, command], signalSame: signal === context.signal, signalPresent: !!signal, aborted: !!signal?.aborted });
      if (test.error) throw Error(test.error);
      if ('thrown' in test) throw test.thrown;
      if (test.reject) return Promise.reject(Error(test.reject));
      return test.response ?? { ok: true, message: 'scripted response', data: { accepted: command } };
    }} as any);
    let result;
    try {
      result = { result: await tools.find(t => t.name === 'messenger.' + test.action)!.execute(test.input, context as any) };
    } catch (error) {
      result = { thrown: error instanceof Error ? { error: error.message } : { value: error } };
    }
    results.push({ ...result, events });
  }
  return results;
}
