/** Owned synthetic probes only; Rust owns all expected outputs. */
export async function assessmentReview(subject: any, call: any): Promise<unknown> {
  const input = { targets: ['192.0.2.10', '192.0.2.11'], exclusions: [], ports: [22, 80], authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...call.input };
  const error = (fn: () => unknown): string | null => { try { fn(); return null; } catch (err) { return (err as Error).message; } };
  if (call.action === 'validate') {
    const message = error(() => subject.validateScope(input));
    return message === null ? { accepted: true } : { error: message };
  }
  const attempts: unknown[] = [];
  const probe = (target: string, port: number, signal: AbortSignal): Promise<string> => {
    attempts.push([target, port]);
    if (call.action === 'cancel' || call.action === 'budget') return new Promise(resolve => signal.addEventListener('abort', () => resolve('error'), { once: true }));
    if (call.action === 'probe-error') return Promise.reject(new Error('secret-fixture-credential'));
    return Promise.resolve('open');
  };
  const service = new subject.AssessmentService(undefined, probe, 0, call.action === 'budget' ? 10 : 60_000);
  if (call.action === 'path') return error(() => service.createScope(input, 'owner'));
  const scope = service.createScope(input, 'owner');
  if (call.action === 'clone') {
    scope.targets.push('192.0.2.99');
    const reread = service.getScope(scope.id, 'owner');
    reread.ports.push(999);
    const current = service.getScope(scope.id, 'owner');
    return { targets: current.targets, ports: current.ports, wrongOwner: error(() => service.getScope(scope.id, 'other')), emptyOwner: error(() => service.createScope(input, '')) };
  }
  if (call.action === 'ownership') {
    const errors = { scope: error(() => service.start(scope.id, 'other')), node: error(() => service.start(scope.id, 'owner', 'remote-node')) };
    // A missing owner guard can create an unauthorized run. Finish it before
    // continuing so the mutation exercises an assertion rather than a setup error.
    const unauthorized = service.history('other').runs;
    for (const run of unauthorized) await service.wait(run.id, 'other');
    const run = service.start(scope.id, 'owner');
    const active = error(() => service.start(scope.id, 'owner'));
    const cancel = error(() => service.cancel(run.id, 'other'));
    await service.wait(run.id, 'owner');
    return { ...errors, active, cancel, wrongHistory: service.history('other').runs.length };
  }
  if (call.action === 'method') return error(() => service.start(scope.id, 'owner'));
  const originalNow = Date.now;
  try {
    if (call.action === 'budget') { const now = Date.now(); Date.now = () => now; }
    const run = service.start(scope.id, 'owner');
    if (call.action === 'cancel') service.cancel(run.id, 'owner');
    const result = await service.wait(run.id, 'owner');
    return { status: result.status, planned: result.plannedChecks, attempts, observations: result.observations.map((item: any) => ({ target: item.target, port: item.port, state: item.state, evidence: typeof item.evidenceId === 'string' && item.evidenceId.length > 0 })), incomplete: result.coverageGaps.some((gap: string) => gap.includes('not performed')), leaked: JSON.stringify(result).includes('secret-fixture-credential') };
  } finally { Date.now = originalNow; }
}
