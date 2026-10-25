/** Rust supplies scenarios and assertions; this drives real chat routes and ACP transport. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AcpProvider } from '../../../packages/gateway/src/providers/acp-provider.ts';
import { ProviderRegistry } from '../../../packages/gateway/src/providers/registry.ts';
import { createServer } from '../../../packages/gateway/src/server.ts';
import { loadConfig } from '../../../packages/gateway/src/config.ts';
import { signAuthToken } from '../../../packages/gateway/src/security/http-auth.ts';
import { interventionRunResumeRegistry } from '../../../packages/gateway/src/services/intervention-run-resume.ts';

export async function dispatch(call: any) {
  if (call.op !== 'providersteering.chat') throw new Error('unknown provider steering operation');
  const directory = resolve(call.directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'fixture.json'), JSON.stringify(call.fixture));
  writeFileSync(join(directory, 'wire.jsonl'), '');
  const wire = (): any[] => readFileSync(join(directory, 'wire.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const until = async (predicate: () => boolean) => {
    const deadline = Date.now() + 10_000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('fixture barrier timed out: ' + JSON.stringify(wire()));
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  const originalLog = console.log;
  console.log = (...args) => console.error(...args);
  const provider = new AcpProvider({
    id: 'codex', name: 'Steering fixture', description: 'Local contract peer', command: process.execPath,
    args: [resolve(import.meta.dir, '../fixtures/steering-agent.cjs'), directory],
  });
  const registry = new ProviderRegistry();
  registry.register(provider);
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: 'silent' as const, nodeEnv: 'test' as const };
  const app = await createServer(config, { providerRegistry: registry });
  const sessionId = 'steering-contract';
  let chat: Promise<any> | undefined;
  try {
    const token = await signAuthToken({ id: 'steering-user', username: 'tester' }, config.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    let settled = false;
    chat = app.inject({ method: 'POST', url: '/api/chat', headers, payload: { sessionId, provider: 'codex', content: 'work on the task' } }).then(response => { settled = true; return response; });
    await until(() => wire().some(row => row.kind === 'prompt'));
    const responses = [];
    for (const message of call.messages) {
      if (message.hidden) {
        responses.push(await interventionRunResumeRegistry.resumeChatSession(sessionId, message.message, { hidden: true }));
      } else {
        const response = await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/steer`, headers, payload: message });
        responses.push({ status: response.statusCode, body: response.json() });
      }
    }
    if (call.waitForSteers) await until(() => wire().filter(row => row.kind === 'steer').length >= call.waitForSteers);
    let settledBeforeAck: boolean | undefined;
    if (call.fixture.holdAck) {
      writeFileSync(join(directory, 'finish'), '');
      await until(() => wire().some(row => row.kind === 'completed'));
      // Let the terminal event traverse the real SDK before releasing the ack.
      await new Promise(resolve => setTimeout(resolve, 30));
      settledBeforeAck = settled;
      writeFileSync(join(directory, 'ack'), '');
    } else writeFileSync(join(directory, 'finish'), '');
    const response = await chat;
    const events = response.body.split('\n').filter((line: string) => line.startsWith('data: ')).map((line: string) => JSON.parse(line.slice(6)));
    const history = await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}/messages`, headers });
    return { status: response.statusCode, responses, wire: wire(), events, history: history.json(), ...(settledBeforeAck !== undefined ? { settledBeforeAck } : {}) };
  } finally {
    writeFileSync(join(directory, 'ack'), '');
    writeFileSync(join(directory, 'finish'), '');
    await provider.dispose();
    if (chat) await chat;
    await app.close();
    console.log = originalLog;
  }
}
