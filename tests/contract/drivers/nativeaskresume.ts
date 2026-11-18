/** Test-only bridge: drives the real resumable user-question code with a fixed
 * wall clock and caller-controlled timers (never sleeping for 60 s), then
 * reports observable results. Assertions live in Rust; this file never
 * re-implements the logic under test.
 */
import { UserQuestionService } from '../../../packages/gateway/src/services/user-questions.ts';
import { createUserAskTool } from '../../../packages/gateway/src/tools/user-question-tools.ts';

const NOW = 1_792_324_800_000; // 2026-10-18T12:00:00.000Z
const RealDate = Date;

type Timer = { id: number; callback: () => void; delay: number };

/** Replaces setTimeout/clearTimeout so the 60 s deadline fires on demand and the
 * scheduled delays stay observable. */
function controlledTimers() {
  const timers: Timer[] = [];
  let next = 1;
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  (globalThis as any).setTimeout = (callback: () => void, delay?: number) => {
    const id = next++;
    timers.push({ id, callback, delay: Number(delay ?? 0) });
    return id as any;
  };
  (globalThis as any).clearTimeout = (id: any) => {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index >= 0) timers.splice(index, 1);
  };
  return {
    timers,
    fire() {
      for (const timer of timers.splice(0)) timer.callback();
    },
    restore() {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    },
  };
}

/** Lets every promise reaction queued so far run. */
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

/** Replaces generated request ids so TS and Rust can compare the same shapes. */
function scrub(value: any, ids: Set<string>): any {
  if (typeof value === 'string') return ids.has(value) ? '<requestId>' : value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, ids));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrub(item, ids)]),
    );
  }
  return value;
}

async function scenario(call: any) {
  const clock = controlledTimers();
  const savedDate = globalThis.Date;
  (globalThis as any).Date = class extends RealDate {
    constructor(...args: any[]) {
      super(...((args.length ? args : [NOW]) as []));
    }
    static now() {
      return NOW;
    }
  };
  try {
    const events: any[] = [];
    const project = (kind: string) => (request: any) => {
      events.push({
        kind,
        status: request.status,
        title: request.title,
        createdAt: request.createdAt,
        questions: request.questions.length,
      });
    };
    const service = new UserQuestionService({
      onRequest: project('request'),
      onResolved: project('resolved'),
    });
    const tool = createUserAskTool(service);
    const ids: string[] = [];
    const seen = new Set<string>();
    const steps: any[] = [];
    const remember = () => {
      for (const id of ids) seen.add(id);
      for (const request of service.listPending()) seen.add(request.id);
    };
    const idOf = (selector: any) => {
      if (selector === 'last') return service.listPending().at(-1)?.id;
      return ids[selector];
    };
    const act = (action: any) => {
      if (action.op === 'submit') {
        return { ok: service.submit(idOf(action.request), action.value ?? null, action.userId ?? null) };
      }
      if (action.op === 'cancel') {
        return { ok: service.cancel(idOf(action.request), action.userId ?? null) };
      }
      throw new Error(`unknown action ${action.op}`);
    };
    for (const step of call.steps) {
      if (step.op === 'observeDetached') {
        service.onDetachedResolved = project('detached');
        steps.push({ observing: true });
      } else if (step.op === 'start') {
        ids.push(service.startResumable({
          sessionId: step.sessionId,
          userId: step.userId ?? null,
          requestedBy: step.requestedBy ?? 'user.ask',
          title: step.title,
          attention: step.attention,
          questions: step.questions ?? [],
        }));
        steps.push({ started: true });
      } else if (step.op === 'ask') {
        const holder: any = { settled: false, result: null };
        const promise = tool.execute(step.input, step.context).then((result: any) => {
          holder.settled = true;
          holder.result = result;
        });
        await flush();
        if (step.fire !== false) { clock.fire(); await flush(); }
        if (holder.settled) await promise;
        steps.push(holder);
      } else if (step.op === 'wait') {
        const holder: any = { settled: false, outcome: null };
        const promise = service
          .waitForAnswer(idOf(step.request), step.sessionId, step.userId ?? null, step.options)
          .then((outcome: any) => {
            holder.settled = true;
            holder.outcome = outcome;
          });
        await flush();
        if (step.fire !== false) { clock.fire(); await flush(); }
        if (holder.settled) await promise;
        steps.push(holder);
      } else if (step.op === 'concurrent') {
        const holders = step.waits.map((wait: any) => {
          const holder: any = { settled: false, outcome: null };
          service
            .waitForAnswer(idOf(wait.request), wait.sessionId, wait.userId ?? null, wait.options)
            .then((outcome: any) => {
              holder.settled = true;
              holder.outcome = outcome;
            });
          return holder;
        });
        await flush();
        const applied = step.then ? act(step.then) : null;
        await flush();
        steps.push({ applied, waits: holders });
        if (step.fire !== false) { clock.fire(); await flush(); }
        steps.push({ appliedAfterFire: step.then ? act(step.then) : null });
      } else if (step.op === 'submit' || step.op === 'cancel') {
        steps.push(act(step));
      } else if (step.op === 'list') {
        const pending = service.listPending(step.sessionId, step.userId ?? null);
        steps.push({ count: pending.length, statuses: pending.map((request: any) => request.status) });
      } else {
        throw new Error(`unknown step ${step.op}`);
      }
      remember();
      await flush();
    }
    const pending = service.listPending();
    return scrub(
      {
        events,
        steps,
        pending: { count: pending.length, statuses: pending.map((request: any) => request.status) },
      },
      seen,
    );
  } finally {
    clock.restore();
    globalThis.Date = savedDate;
  }
}

/** Reports the deadline the real code schedules and that it is cleared again. */
async function timers(options?:any) {
  const clock = controlledTimers();
  try {
    const service = new UserQuestionService();
    const id = service.startResumable({
      sessionId: 's',
      userId: null,
      requestedBy: 'user.ask',
      questions: [{ id: 'q', header: 'H', question: 'Q' }],
    });
    const promise = service.waitForAnswer(id, 's', null, options);
    await flush();
    const scheduled = clock.timers.map((timer) => timer.delay);
    clock.fire();
    await flush();
    const outcome = await promise;
    return { scheduled, outcome, remaining: clock.timers.length };
  } finally {
    clock.restore();
  }
}

export async function dispatch(call: any) {
  if (call.op === 'nativeaskresume.scenario') return scenario(call);
  if (call.op === 'nativeaskresume.timers') return timers(call.options);
  throw new Error(`unknown nativeaskresume op ${call.op}`);
}
