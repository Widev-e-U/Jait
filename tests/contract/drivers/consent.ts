/** Independent consent lifecycle observations. Rust supplies scenarios and owns the safety oracle. */
import { ConsentAwareExecutor } from '../../../packages/gateway/src/security/consent-executor.ts';
import { ConsentManager } from '../../../packages/gateway/src/security/consent-manager.ts';
import { TrustEngine } from '../../../packages/gateway/src/security/trust-engine.ts';

export async function dispatch(call: { op: string; mode: string; delegate: boolean }): Promise<unknown> {
  if (call.op !== 'consent.lifecycle') throw new Error('Unknown consent operation');
  const modes = ['approve', 'reject', 'shutdown', 'timeout', 'abort-before-approval',
    'abort-after-approval', 'already-aborted-full-access', 'already-aborted-consent', 'dry-run'];
  if (!modes.includes(call.mode)) throw new Error('Unknown consent lifecycle scenario');
  const effects: string[] = [];
  const manager = new ConsentManager({ defaultTimeoutMs: 1000 });
  const trust = new TrustEngine();
  const approvals = new Set<string>();
  const controller = new AbortController();
  const tool = 'fixture.effect';
  const effect = async (route: string) => { effects.push(route); return { ok: true, message: 'Fixture effect completed' }; };
  const executor = new ConsentAwareExecutor({
    toolRegistry: { execute: () => effect('registry') } as any,
    consentManager: manager,
    trustEngine: trust,
    permissions: new Map(), // Unknown tools require consent; no profile or trust bypass.
    sessionApprovals: approvals,
    ...(call.delegate ? { delegate: () => effect('delegate') } : {}),
  });
  if (call.mode.startsWith('already-aborted')) controller.abort();
  try {
    const pending = executor.execute(tool, {}, {
      sessionId: 'independent-consent', actionId: call.mode, projectRoot: import.meta.dirname,
      requestedBy: 'test', signal: controller.signal,
      ...(call.mode === 'already-aborted-full-access' ? { runtimeMode: 'full-access' as const } : {}),
    }, { dryRun: call.mode === 'dry-run', consentTimeoutMs: call.mode === 'timeout' ? 1 : 1000 });
    const before = { effects: [...effects], pending: manager.pendingCount };
    const request = manager.listPending()[0];
    if (call.mode === 'abort-before-approval') controller.abort();
    if (request && call.mode !== 'timeout') {
      if (call.mode === 'reject') manager.reject(request.id);
      else if (call.mode === 'shutdown') manager.cancelAll();
      else manager.approve(request.id);
    }
    // Approving resolves a Promise; abort before its awaiting continuation runs.
    if (call.mode === 'abort-after-approval') controller.abort();
    const result = await pending;
    return { before, effects, ok: result.ok, pending: manager.pendingCount,
      approvedCount: trust.getState(tool).approvedCount, sessionApprovals: [...approvals] };
  } finally { manager.cancelAll(); }
}
