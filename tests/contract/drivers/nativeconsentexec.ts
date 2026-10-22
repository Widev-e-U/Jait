/** Scenario transport over the real consent executor; no policy logic reproduced here. */
import { ConsentAwareExecutor } from '../../../packages/gateway/src/security/consent-executor.ts';
import { ConsentManager } from '../../../packages/gateway/src/security/consent-manager.ts';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function dispatch(call: any) {
  if (call.op !== 'nativeconsentexec.scenario') throw new Error('unknown consent executor operation');
  const artifactRoot = fileURLToPath(new URL('../../../.jait/artifacts/', import.meta.url));
  const marker = resolve(call.marker);
  if (relative(artifactRoot, marker).startsWith('..')) throw new Error('fixture marker escaped artifact root');
  const requests: any[] = [], delegateCalls: any[] = [], trustApprovals: string[] = [];
  const approvals = new Set<string>(call.approvals ?? []);
  const abort = new AbortController();
  if (call.preCancel) abort.abort();
  let step: any;
  const consent = new ConsentManager({ onRequest(request) {
    requests.push({toolName: request.toolName, summary: request.summary, preview: request.preview, risk: request.risk, policy: request.policy, sessionId: request.sessionId});
    if (step.decision === 'cancel-approved') { abort.abort(); consent.approve(request.id); }
    else if (step.decision === 'reject') consent.reject(request.id, 'click', step.reason);
    else if (step.decision !== 'timeout') consent.approve(request.id);
  }});
  if (call.approveAll) consent.enableApproveAllForSession('session');
  const executor = new ConsentAwareExecutor({
    toolRegistry: {} as any, consentManager: consent,
    trustEngine: {getLevel: () => call.trustLevel ?? 0, recordApproval: (name: string) => trustApprovals.push(name)} as any,
    permissions: new Map((call.permissions ?? []).map((p: any) => [p.toolName, p])),
    sessionApprovals: approvals, profileName: call.profileName,
    delegate: async (name, input) => {
      delegateCalls.push({name, input});
      if (step.throw) throw new Error(step.throw);
      const result = spawnSync('/usr/bin/touch', [marker], {timeout: 3000, maxBuffer: 4096, env: {}});
      if (result.status !== 0) throw new Error('fixture child failed');
      return {ok: step.resultOk ?? true, message: 'Delegate complete', data: {output: 'fixture output', exitCode: 0}};
    },
  });
  const results: any[] = [];
  try {
    for (step of call.steps) {
      try { results.push(await executor.execute(step.name, step.input, {
        userId: 'user', sessionId: 'session', actionId: 'action', projectRoot: artifactRoot,
        requestedBy: call.origin ?? 'agent', runtimeMode: call.runtimeMode, signal: abort.signal,
      }, {dryRun: step.dryRun, consentTimeoutMs: step.decision === 'timeout' ? 2 : 5000})); }
      catch (error) { results.push({error:error instanceof Error ? error.message : String(error)}); }
    }
    return {results, requests, delegateCalls, trustApprovals, approvals: [...approvals].sort(), pending: consent.pendingCount, sideEffect: existsSync(marker)};
  } finally { consent.cancelAll('fixture cleanup'); }
}
