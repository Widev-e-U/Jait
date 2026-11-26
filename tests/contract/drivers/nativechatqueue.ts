import { createServer as createModelServer } from 'node:http';
import { loadConfig } from '../../../packages/gateway/src/config.ts';
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/index.ts';
import { createServer } from '../../../packages/gateway/src/server.ts';
import { signAuthToken } from '../../../packages/gateway/src/security/http-auth.ts';
import { SessionService } from '../../../packages/gateway/src/services/sessions.ts';
import { SessionStateService } from '../../../packages/gateway/src/services/session-state.ts';
import { UserService } from '../../../packages/gateway/src/services/users.ts';

interface QueueRequest {
  op: 'nativechatqueue.claim';
  queue: Array<Record<string, unknown>>;
  content: string;
}

function queueIdentity(value: unknown) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('queued_messages is not an array');
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid queue entry');
    return { id: entry.id, content: entry.content, personaAgentId: entry.personaAgentId ?? null, held: entry.held === true };
  });
}

export async function dispatch(call: QueueRequest) {
  if (call.op !== 'nativechatqueue.claim') throw new Error('unknown chat-queue operation');
  const log = console.log;
  console.log = (...args: unknown[]) => console.error(...args);
  const model = createModelServer((request, response) => {
    request.resume();
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Queue fixture answered.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
  let application: Awaited<ReturnType<typeof createServer>> | undefined;
  let database: Awaited<ReturnType<typeof openDatabase>> | undefined;
  try {
    await new Promise<void>(resolve => model.listen(0, '127.0.0.1', resolve));
    const address = model.address();
    if (!address || typeof address === 'string') throw new Error('model fixture has no TCP address');
    const modelBase = `http://127.0.0.1:${address.port}/v1`;
    database = await openDatabase(':memory:');
    const { db, sqlite } = database;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser('queue-owner', 'queue-fixture-password');
    userService.updateSettings(user.id, {
      apiKeys: { OPENAI_BASE_URL: modelBase, OPENAI_API_KEY: 'queue-fixture-key' },
      selectedModel: 'queue-fixture-model',
    });
    const session = sessionService.create({ userId: user.id, name: 'Queue identity' });
    sessionState.set(session.id, {
      queued_messages: call.queue,
      'chat.provider': 'jait',
      'chat.cliModels': { jait: 'queue-fixture-model' },
    });
    const config = {
      ...loadConfig(), port: 0, wsPort: 0, host: '127.0.0.1', nodeEnv: 'test', logLevel: 'silent',
      llmProvider: 'openai' as const, openaiBaseUrl: modelBase,
      openaiApiKey: 'queue-fixture-key', openaiModel: 'queue-fixture-model',
      jwtSecret: 'queue-fixture-secret',
    };
    application = await createServer(config, { db, sqlite, sessionService, sessionState, userService });
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await application.inject({
      method: 'POST', url: '/api/chat', headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: call.content, provider: 'jait', model: 'queue-fixture-model' },
    });
    if (response.statusCode !== 200) throw new Error(`reference chat failed: ${response.statusCode} ${response.body}`);
    const state = sessionState.get(session.id, ['queued_messages', 'chat.consumedQueueIds']);
    return {
      status: response.statusCode,
      queue: queueIdentity(state.queued_messages),
      consumed: state['chat.consumedQueueIds'] ?? [],
    };
  } finally {
    try {
      await application?.close();
    } finally {
      database?.sqlite.close();
      model.closeAllConnections();
      await new Promise<void>(resolve => model.close(() => resolve()));
      console.log = log;
    }
  }
}
