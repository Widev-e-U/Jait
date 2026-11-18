/** Production-call adapter only. Rust owns test vectors and expected results. */
import { bm25Rank, bm25Tokens } from '../../../packages/gateway/src/memory/scoring.ts';
import { limitSerializedJson, limitUtf8, serializeBoundedJson } from '../../../packages/gateway/src/lib/bounded-json.ts';
import { resolveCommandTimeoutMs, defaultCommandTimeoutMs, maxCommandTimeoutMs } from '../../../packages/gateway/src/lib/command-timeout.ts';
import { extractSubAgentPayloads, stripSubAgentPayloads } from '../../../packages/gateway/src/lib/sub-agent-persistence.ts';
import { serializePersistedToolCalls } from '../../../packages/gateway/src/lib/persisted-tool-calls.ts';
import { isValidCronExpression } from '../../../packages/gateway/src/scheduler/cron.ts';

// Compact fixture descriptions let Rust request oversize inputs within transport limits.
function materialize(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if ('$repeat' in value) return String(value.$repeat[0]).repeat(value.$repeat[1]);
  if ('$concat' in value) return value.$concat.map((part: any) => materialize(part)).join('');
  if (Array.isArray(value)) return value.map(materialize);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item)]));
}
export async function dispatch(call: any): Promise<unknown> {
  const input = materialize(call.input);
  switch (call.op) {
    case 'fixtures.tokens': return bm25Tokens(input);
    case 'fixtures.rank': return bm25Rank(call.query, input.map((text: string) => ({ item: text, text })));
    case 'fixtures.bounded': {
      if (call.circular) input.self = input;
      return serializeBoundedJson(input, call.max);
    }
    case 'fixtures.utf8': return limitUtf8(input, call.max);
    case 'fixtures.limit-json': return limitSerializedJson(input, call.max);
    case 'fixtures.timeout': {
      const names = ['JAIT_TERMINAL_TIMEOUT_MS', 'JAIT_TERMINAL_TIMEOUT_MAX_MS'];
      for (const name of names) delete process.env[name];
      Object.assign(process.env, call.env ?? {});
      const value = call.special === 'NaN' ? NaN : call.special === 'Infinity' ? Infinity : call.special === '-Infinity' ? -Infinity : input;
      return { resolved: resolveCommandTimeoutMs(value), default: defaultCommandTimeoutMs(), max: maxCommandTimeoutMs() };
    }
    case 'fixtures.extract': return extractSubAgentPayloads(call.raw ? input : JSON.stringify(input));
    case 'fixtures.strip': return stripSubAgentPayloads(call.raw ? input : JSON.stringify(input)) ?? null;
    case 'fixtures.persisted': return serializePersistedToolCalls(call.raw ? input : JSON.stringify(input), call.options);
    case 'fixtures.cron': return isValidCronExpression(input);
    case 'fixtures.matches-minute': {
      const { matchesCronMinute } = await import('../../../packages/gateway/src/scheduler/service.ts');
      return matchesCronMinute(input.cron, new Date(input.now));
    }
    case 'fixtures.scheduler-guard': {
      // Exercise the create/update cron validation guards against an in-memory database.
      // `migrateDatabase` prints progress with console.log. stdout must remain a
      // single valid JSON document, so redirect those diagnostics to stderr for the
      // duration of the call and restore afterwards.
      const stdoutLog = console.log;
      console.log = (...args: unknown[]) => { console.error(...args); };
      try {
        const { openDatabase, migrateDatabase } = await import('../../../packages/gateway/src/db/index.ts');
        const { SchedulerService } = await import('../../../packages/gateway/src/scheduler/service.ts');
        const { db, sqlite } = await openDatabase(':memory:');
        migrateDatabase(sqlite);
        const scheduler = new SchedulerService({ db, executeTool: async () => ({ ok: true } as any) });
        const result: Record<string, unknown> = {
          createThrew: false, createMessage: null, listLength: 0, updateThrew: false, updateMessage: null, job: null,
        };
        try {
          scheduler.create({ name: 'Invalid health review', cron: 'not-a-cron', toolName: 'gateway.status' });
        } catch (error) {
          result.createThrew = true;
          result.createMessage = (error as Error).message;
        }
        result.listLength = scheduler.list().length;
        const job = scheduler.create({ name: 'Weekly health review', cron: '0 9 * * 1', toolName: 'gateway.status', enabled: false });
        try {
          scheduler.update(job.id, { name: 'Changed', cron: 'not-a-cron' });
        } catch (error) {
          result.updateThrew = true;
          result.updateMessage = (error as Error).message;
        }
        const after = scheduler.get(job.id)!;
        result.job = { name: after.name, cron: after.cron, enabled: after.enabled };
        sqlite.close();
        return result;
      } finally {
        console.log = stdoutLog;
      }
    }
    default: throw new Error('unknown fixtures operation');
  }
}
