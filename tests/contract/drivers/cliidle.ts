import { CliSessionIdleTracker, cliSessionIdle, CLI_USER_IDLE_TIMEOUT_MS } from '../../../packages/gateway/src/providers/session-idle.ts';
import { AcpProvider } from '../../../packages/gateway/src/providers/acp-provider.ts';
import { stopSessionProcess } from '../../../packages/gateway/src/providers/session-process.ts';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Deterministic time exercises the production lease owner, never a copied policy.
export async function dispatch(call: any) {
  if (call.op === 'cliidle.provider') return providerLifecycle();
  if (call.op === 'cliidle.process') return processTreeCleanup();
  const originalNow = Date.now;
  let now = 1_000_000;
  const tracker = new CliSessionIdleTracker();
  const busy = new Set<string>();
  const expired: string[] = [];
  const results: string[][] = [];
  Date.now = () => now;
  try {
    for (const action of call.actions) {
      now = 1_000_000 + (action.at ?? 0);
      if (action.kind === 'user') tracker.recordUserMessage(action.thread);
      if (action.kind === 'watch') tracker.watch(action.id, action.thread, () => busy.has(action.id), async () => { expired.push(action.id); });
      if (action.kind === 'busy') busy.add(action.id);
      if (action.kind === 'idle') busy.delete(action.id);
      if (action.kind === 'forget') tracker.forget(action.id);
      tracker.reap();
      results.push([...expired]);
    }
    return { timeout: CLI_USER_IDLE_TIMEOUT_MS, results };
  } finally {
    for (const action of call.actions) if (action.id) tracker.forget(action.id);
    Date.now = originalNow;
  }
}

async function processTreeCleanup() {
  if (process.platform !== 'linux') return { skipped: true };
  const descendantScript = `process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write(String(process.pid) + '\\n');`;
  const parentScript = `process.on('SIGTERM', () => {}); require('node:child_process').spawn('node', ['-e', ${JSON.stringify(descendantScript)}], { stdio: ['ignore', 'inherit', 'inherit'] }); setInterval(() => {}, 1000);`;
  const parent = spawn('node', ['-e', parentScript], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const sentinel = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  let descendant: number | undefined;
  const alive = (pid: number | undefined) => {
    if (!pid) return false;
    try { return !/\) Z /.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return false; }
  };
  try {
    let output = '';
    parent.stdout!.on('data', chunk => { output += chunk; });
    const readyDeadline = Date.now() + 5_000;
    while (!output.includes('\n')) {
      if (Date.now() > readyDeadline) throw new Error('process fixture did not start');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    descendant = Number(output.trim());
    stopSessionProcess(parent);
    await new Promise(resolve => setTimeout(resolve, 100));
    const gracefulAttemptDidNotKillResistantChild = alive(descendant);
    const deadline = Date.now() + 7_000;
    while (alive(parent.pid) || alive(descendant)) {
      if (Date.now() > deadline) throw new Error('process tree survived bounded escalation');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return { gracefulAttemptDidNotKillResistantChild, parentStopped: !alive(parent.pid), descendantStopped: !alive(descendant), unrelatedProcessAlive: alive(sentinel.pid) };
  } finally { stopSessionProcess(parent); sentinel.kill('SIGKILL'); }
}

async function providerLifecycle() {
  const script = `
    require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
      const r = JSON.parse(line);
      if (r.id === undefined) return;
      let result = {};
      if (r.method === 'initialize') result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      if (r.method === 'session/new') result = { sessionId: 'fixture-session' };
      const reply = () => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: r.id, result }) + '\\n');
      if (r.method === 'session/prompt') setTimeout(() => { result = { stopReason: 'end_turn' }; reply(); }, 100);
      else reply();
    });
  `;
  const provider = new AcpProvider({ id: 'idle-contract', providerType: 'codex', name: 'Fixture', description: '', command: 'node', args: ['-e', script], auth: false });
  const events: string[] = [];
  const off = provider.onEvent(event => events.push(event.type));
  const options = { threadId: 'idle-contract-thread', workingDirectory: process.cwd() };
  try {
    cliSessionIdle.recordUserMessage(options.threadId);
    const session = await provider.startSession(options);
    const turn = provider.sendTurn(session.id, 'Fixture user message');
    cliSessionIdle.reap(Date.now() + CLI_USER_IDLE_TIMEOUT_MS);
    const activeProtected = provider.hasSession(session.id);
    await turn;
    cliSessionIdle.reap(Date.now() + CLI_USER_IDLE_TIMEOUT_MS);
    const retiredSynchronously = !provider.hasSession(session.id);
    const deadline = Date.now() + 4_000;
    while (!events.includes('session.completed')) {
      if (Date.now() > deadline) throw new Error('idle cleanup did not complete');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    cliSessionIdle.recordUserMessage(options.threadId);
    const fresh = await provider.startSession(options);
    await provider.sendTurn(fresh.id, 'Follow-up from saved conversation');
    return { activeProtected, retiredSynchronously, completed: events.includes('session.completed'), freshSession: fresh.id !== session.id && provider.hasSession(fresh.id), error: events.includes('session.error') };
  } finally { off(); await provider.dispose(); }
}
