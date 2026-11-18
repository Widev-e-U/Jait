/** Test-only production adapters. Fixture inputs and expected values belong to Rust. */
import { SSRFGuard } from '../../../packages/gateway/src/security/ssrf-guard.ts';
import * as network from '../../../packages/gateway/src/lib/network-scan.ts';
import { AssessmentService, validateScope } from '../../../packages/gateway/src/security/assessment.ts';

function captured(fn: () => unknown) {
  try { return { value: fn() ?? null }; } catch (error) { return { error: String((error as Error).message) }; }
}
function scopeInput(call: any) {
  return { ...call.input, expiresAt: new Date(Date.now() + (call.expiresInMs ?? 60_000)).toISOString() };
}
export async function dispatch(call: any): Promise<unknown> {
  switch (call.op) {
    case 'security.ssrf': return captured(() => new SSRFGuard(call.options).validate(call.url).href);
    case 'security.network.arp': return network.parseArpTable(call.input);
    case 'security.network.prefix': return network.normalizeSubnetPrefix(call.input);
    case 'security.network.ipv4': return network.isValidIpv4(call.input);
    case 'security.network.ips': return network.normalizeIps(call.input);
    case 'security.network.merge': return network.mergeEntries(call.input);
    case 'security.network.candidates': return network.buildSubnetCandidates(call.input);
    case 'security.scope.validate': return captured(() => validateScope(scopeInput(call)));
    case 'security.tcp-before-after': {
      const { createServer } = await import('node:net');
      const server = createServer(socket => socket.end());
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Expected listening address');
        const service = new AssessmentService();
        const scope = service.createScope(scopeInput({ ...call, input: { targets: ['127.0.0.1'], exclusions: [], ports: [address.port], authorized: true } }), 'fixture-owner');
        const before = await service.wait(service.start(scope.id, 'fixture-owner').id, 'fixture-owner');
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        const after = await service.wait(service.start(scope.id, 'fixture-owner').id, 'fixture-owner');
        return { before, after };
      } finally { if (server.listening) server.close(); }
    }
    case 'security.assessment': {
      const attempts: unknown[] = [];
      let probeIndex = 0;
      const probe = (target: string, port: number, signal: AbortSignal): Promise<any> => {
        attempts.push([target, port]);
        if (call.blockProbe) return new Promise(resolve => signal.addEventListener('abort', () => resolve(call.abortState), { once: true }));
        const state = call.states[probeIndex++];
        if (typeof state === 'object' && state.error) return Promise.reject(new Error(state.error));
        return Promise.resolve(state);
      };
      let db: any;
      if (call.persistence) {
        const { openRawSqlite } = await import('../../../packages/gateway/src/db/sqlite-shim.ts');
        const { migrations } = await import('../../../packages/gateway/src/db/migrations.ts');
        db = await openRawSqlite(':memory:');
        migrations.find(m => m.id === 67)!.run(db);
        if (call.failCompletionPersistence) {
          const realPrepare = db.prepare.bind(db);
          let writes = 0;
          db.prepare = (sql: string) => {
            const statement = realPrepare(sql);
            if (sql.startsWith('INSERT INTO security_assessment_runs')) {
              const realRun = statement.run.bind(statement);
              statement.run = (...params: unknown[]) => {
                if (++writes > 1) throw new Error('private storage details');
                return realRun(...params);
              };
            }
            return statement;
          };
        }
      }
      const originalNow = Date.now;
      try {
        if (call.freezeClock) { const now = Date.now(); Date.now = () => now; }
        const service = new AssessmentService(db, probe, call.intervalMs ?? 0, call.durationMs ?? 60_000);
        const scope = service.createScope(scopeInput(call), call.owner);
        if (call.mutateTarget) scope.targets.push(call.mutateTarget);
        if (call.delayBeforeStartMs) await Bun.sleep(call.delayBeforeStartMs);
        if (call.startOnly) return captured(() => service.start(scope.id, call.owner));
        const errors: Record<string, unknown> = {};
        if (call.checkOwnership) {
          errors.otherStart = captured(() => service.start(scope.id, call.other));
          errors.nodeStart = captured(() => service.start(scope.id, call.owner, call.node));
        }
        const run = service.start(scope.id, call.owner);
        if (call.checkOwnership) {
          errors.duplicateStart = captured(() => service.start(scope.id, call.owner));
          errors.otherCancel = captured(() => service.cancel(run.id, call.other));
        }
        let interrupted;
        if (call.reopenWhileRunning) interrupted = new AssessmentService(db).getRun(run.id, call.owner);
        if (call.advanceClockMs) Date.now = () => originalNow() + call.advanceClockMs;
        if (call.cancel) service.cancel(run.id, call.owner);
        const result = await service.wait(run.id, call.owner);
        const reopened = db && !call.reopenWhileRunning && !call.failCompletionPersistence ? new AssessmentService(db) : undefined;
        return { attempts, scope, result, errors, otherHistory: service.history(call.other ?? 'other'), interrupted,
          recoveredRun: reopened?.getRun(run.id, call.owner), recoveredHistory: reopened?.history(call.owner) };
      } finally { Date.now = originalNow; db?.close(); }
    }
    default: throw new Error('unknown security driver operation');
  }
}
