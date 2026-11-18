/** Real TypeScript bootstrap/routes with isolated persistent state; Rust owns scenarios. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from '../../../packages/gateway/src/server.ts';

export async function dispatch(call: any) {
  if (call.op === 'nativeapplication.reopen') {
    process.env.__JAIT_CLI = '1';
    const { resolve, sep } = await import('node:path');
    const allowed = fileURLToPath(new URL('../../../.jait/artifacts/gateway-rust/application/native/', import.meta.url));
    const databasePath = resolve(call.database);
    if (!databasePath.startsWith(allowed.endsWith(sep) ? allowed : allowed + sep) ||
        !databasePath.endsWith(sep + 'application.sqlite')) throw new Error('fixture database outside application lane');
    const { openDatabase } = await import('../../../packages/gateway/src/db/connection.ts');
    const { UserService } = await import('../../../packages/gateway/src/services/users.ts');
    const { SessionService } = await import('../../../packages/gateway/src/services/sessions.ts');
    const { db, sqlite } = await openDatabase(databasePath);
    try {
      const users = new UserService(db);
      const owner = users.findByUsername('alice');
      return { users: users.countUsers(), username: owner?.username,
        active: new SessionService(db).count('active'), sessions: sqlite.query('SELECT status,name FROM sessions').all() };
    } finally { sqlite.close(); }
  }
  if (call.op !== 'nativeapplication.lifecycle') throw new Error('unknown application operation');
  process.env.__JAIT_CLI = '1';
  const log = console.log;
  console.log = (...args) => console.error(...args);
  const artifactRoot = fileURLToPath(new URL('../../../.jait/artifacts/gateway-rust/application/reference/', import.meta.url));
  mkdirSync(artifactRoot, { recursive: true });
  const work = mkdtempSync(join(artifactRoot, 'run-'));
  const previousWeb = process.env.JAIT_WEB_DIR;
  const previousState = process.env.JAIT_STATE_DIR;
  process.env.JAIT_STATE_DIR = join(work, 'state');
  process.env.JAIT_WEB_DIR = join(work, 'web');
  mkdirSync(process.env.JAIT_WEB_DIR, { recursive: true });
  writeFileSync(join(process.env.JAIT_WEB_DIR, 'index.html'), '<!doctype html><title>Application fixture</title>');
  try {
    const { loadConfig } = await import('../../../packages/gateway/src/config.ts');
    const { openDatabase, migrateDatabase } = await import('../../../packages/gateway/src/db/connection.ts');
    const { UserService } = await import('../../../packages/gateway/src/services/users.ts');
    const { SessionService } = await import('../../../packages/gateway/src/services/sessions.ts');
    const { SessionStateService } = await import('../../../packages/gateway/src/services/session-state.ts');
    const { ProjectService } = await import('../../../packages/gateway/src/services/projects.ts');
    const { AuditWriter } = await import('../../../packages/gateway/src/services/audit.ts');
    const config = {
      ...loadConfig(), jwtSecret: 'application-fixture-secret', logLevel: 'silent' as const,
      llmProvider: 'ollama' as const, ollamaModel: undefined, ollamaUrl: undefined,
    };
    let token = '', cookie = '', sessionId = '';
    const results: any[] = [];
    for (const phase of call.phases) {
      const { db, sqlite } = await openDatabase(join(work, 'application.sqlite'));
      let app: any;
      try {
        migrateDatabase(sqlite);
        app = await createServer(config, {
          sqlite, userService: new UserService(db), sessionService: new SessionService(db),
          sessionState: new SessionStateService(db), projectService: new ProjectService(db),
          audit: new AuditWriter(db),
        });
        const address = await app.listen({ host: '127.0.0.1', port: 0 });
        for (const step of phase) {
          const headers: Record<string, string> = { host: 'fixture.local', connection: 'close', ...step.headers };
          if (step.auth) headers.authorization = 'Bearer ' + token;
          if (step.cookie) headers.cookie = cookie;
          if ('body' in step) headers['content-type'] = 'application/json';
          const response = await fetch(address + step.path.replace('$session', sessionId), {
            method: step.method, headers, redirect: 'manual',
            body: 'body' in step ? JSON.stringify(step.body) : undefined,
          });
          const raw = await response.text();
          let body: any = raw;
          try { body = JSON.parse(raw); } catch {}
          if (body.access_token) token = body.access_token;
          const cookies = response.headers.getSetCookie();
          if (cookies.length) cookie = cookies[0]!.split(';')[0]!;
          if (response.status === 201 && body.id) sessionId = body.id;
          results.push({ status: response.status, body, cookies });
        }
      } finally {
        app?.server.closeAllConnections();
        try { await app?.close(); } finally { sqlite.close(); }
      }
    }
    return results;
  } finally {
    console.log = log;
    if (previousWeb === undefined) delete process.env.JAIT_WEB_DIR; else process.env.JAIT_WEB_DIR = previousWeb;
    if (previousState === undefined) delete process.env.JAIT_STATE_DIR; else process.env.JAIT_STATE_DIR = previousState;
  }
}
