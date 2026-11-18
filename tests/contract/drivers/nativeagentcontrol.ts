import { AgentControlService, AgentHaltedError, agentHaltedBody, isAgentHaltedError, RUNNING_STATE, AGENT_HALTED_CODE } from '../../../packages/gateway/src/services/agent-control.ts';
import { openDatabase } from '../../../packages/gateway/src/db/connection.ts';

export async function dispatch(call: any) {
  if (call.op === 'nativeagentcontrol.errors') {
    return { code: AGENT_HALTED_CODE, running: RUNNING_STATE,
      errors: (call.values ?? []).map(isAgentHaltedError),
      made: (call.construct ?? []).map((v: any) => {
        const e = new AgentHaltedError(v.message, v.action);
        return { name: e.name, code: e.code, message: e.message, ...(e.action !== undefined ? { action: e.action } : {}) };
      }),
      bodies: (call.bodies ?? []).map((v: any) => agentHaltedBody(v.state, v.action)),
    };
  }
  if (call.op !== 'nativeagentcontrol.trace') throw new Error('unknown agent-control operation');
  const OriginalDate = Date;
  const log = console.log;
  console.log = (...args) => console.error(...args);
  let now = '2026-10-20T06:00:00.000Z';
  let sqlite: any;
  try {
    globalThis.Date = class extends OriginalDate {
      constructor(value?: any) { super(value === undefined ? now : value); }
      static override now() { return OriginalDate.parse(now); }
    } as DateConstructor;
    const opened = await openDatabase(':memory:'); sqlite = opened.sqlite;
    sqlite.exec('CREATE TABLE agent_control (user_id TEXT PRIMARY KEY, halted INTEGER NOT NULL DEFAULT 0, reason TEXT, halted_at TEXT, updated_at TEXT NOT NULL)');
    if (call.sql) sqlite.exec(call.sql);
    let current: any;
    const events: any[] = [];
    const results: any[] = [];
    let service: AgentControlService;
    const hooks = {
      stopRunning: async (userId: string) => {
        events.push({ op: 'stop', user: userId, state: service.getState(userId) });
        await Promise.resolve();
        if (current.interleaveResume) new AgentControlService(opened.db).resume(userId);
        if ('stopThrow' in current) throw current.throwString ? current.stopThrow : new Error(current.stopThrow);
        return current.stopResult ?? 0;
      },
      onChange: ({ userId, state }: any) => {
        events.push({ op: 'change', user: userId, state });
        if (current.changeThrow) throw new Error(current.changeThrow);
      },
    };
    service = new AgentControlService(opened.db, call.noHooks ? {} : hooks);
    for (const step of call.steps) {
      current = step;
      if (step.now) now = step.now;
      try {
        let value: any;
        if (step.op === 'state') value = service.getState(step.user);
        else if (step.op === 'isHalted') value = service.isHalted(step.user);
        else if (step.op === 'halt') value = await service.halt(step.user, { reason: step.reason });
        else if (step.op === 'resume') value = service.resume(step.user);
        else if (step.op === 'assert') { service.assertCanRun(step.user, step.action); value = null; }
        else if (step.op === 'body') value = agentHaltedBody(service.getState(step.user), step.action);
        else throw new Error('unknown trace step');
        results.push(value);
      } catch (error: any) {
        results.push({ error: { name: error.name, message: error.message, ...(error.code ? { code: error.code } : {}), ...(error.action !== undefined ? { action: error.action } : {}) } });
      }
    }
    const rows = sqlite.query('SELECT user_id,halted,reason,halted_at,updated_at FROM agent_control ORDER BY user_id').all();
    return { results, events, rows };
  } finally { sqlite?.close(); globalThis.Date = OriginalDate; console.log = log; }
}
