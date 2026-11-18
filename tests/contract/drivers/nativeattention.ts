import { AttentionService, attentionKey, shouldNotifyNatively, attentionActionsForQuestion, CONSENT_ATTENTION_ACTIONS } from '../../../packages/gateway/src/services/attention.ts';
export async function dispatch(call: any) {
  if (call.op === 'nativeattention.helpers') return {
    actions: CONSENT_ATTENTION_ACTIONS,
    keys: call.keys.map((v: any) => attentionKey(v.kind, v.request)),
    surfaces: call.surfaces.map((v: any) => shouldNotifyNatively(v.surface, new Set(v.live))),
    questions: call.questions.map((v: any) => attentionActionsForQuestion(v)),
  };
  if (call.op !== 'nativeattention.trace') throw new Error('unknown attention operation');
  const OriginalDate = Date;
  let now = '2026-10-20T10:00:00.000Z';
  const effects: any[] = [];
  let current: any;
  try {
    globalThis.Date = class extends OriginalDate {
      constructor(value?: any) { super(value === undefined ? now : value); }
      static override now() { return OriginalDate.parse(now); }
    } as DateConstructor;
    const copied = (v: any) => JSON.parse(JSON.stringify(v));
    const check = (op: string) => { if (current.fail === op) throw new Error(`${op} failed`); };
    const ws = {
      liveSurfaces: (user: string | null) => { effects.push({ op: 'live', user }); check('live'); return new Set(call.surfaces ?? ['web', 'desktop', 'android', 'watch']); },
      broadcastBySurface: (user: string | null, make: any) => {
        effects.push({ op: 'bySurface', user, events: (call.surfaces ?? ['web', 'desktop', 'android', 'watch']).map((surface: string) => ({ surface, event: make(surface) })) }); check('bySurface');
      },
      broadcastToUser: (user: string, event: any) => { effects.push({ op: 'user', user, event: copied(event) }); check('user'); },
      broadcastAll: (event: any) => { effects.push({ op: 'all', event: copied(event) }); check('all'); },
    };
    const service = new AttentionService(ws as any, call.noResolver ? {} : { resolveUserId: (session: string) => {
      effects.push({ op: 'resolve', session });
      if (call.resolveFail === session) throw new Error('resolver failed');
      return call.users?.[session] ?? null;
    } });
    const objects = new Map<string, any>();
    const removers: Array<() => void> = [];
    const results: any[] = [];
    for (const step of call.steps) {
      current = step;
      if (step.now) now = step.now;
      try {
        let result: any = null;
        if (step.op === 'add') {
          let object = objects.get(step.id);
          if (!object) {
            const deliver = (op: string, value: any) => {
              effects.push({ op: `sink.${op}`, id: step.id, value: copied(value) });
              const mode = call.sinks?.[step.id]?.[op];
              if (mode === 'throw') throw new Error('sink throw');
              if (mode === 'reject') return Promise.reject(new Error('sink rejection'));
            };
            object = { raised: (item: any) => deliver('raised', item), cleared: (event: any) => deliver('cleared', event) };
            objects.set(step.id, object);
          }
          removers.push(service.addSink(object));
        } else if (step.op === 'remove') removers[step.index]();
        else if (step.op === 'raise') result = service.raise(step.input);
        else if (step.op === 'clear') result = service.clear(step.kind, step.request, step.reason, step.device);
        else if (step.op === 'list') result = service.list(step.user);
        else if (step.op === 'get') result = service.get(step.key) ?? null;
        else throw new Error('unknown trace step');
        results.push(copied(result));
      } catch (error: any) { results.push({ error: error.message }); }
      await Promise.resolve(); // deliver rejected-promise catch without changing synchronous traces
    }
    return { results, effects, open: service.list() };
  } finally { globalThis.Date = OriginalDate; }
}
