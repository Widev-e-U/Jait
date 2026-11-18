/** Encrypted user-secret storage + secret input HTTP reference adapters. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`jait:user-secrets:${secret}`).digest();
}

export async function dispatch(call: any) {
  if (call.op === 'nativesecrets.decrypt') {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(call.secret), Buffer.from(call.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(call.authTag, 'base64'));
    const value = Buffer.concat([decipher.update(Buffer.from(call.encryptedValue, 'base64')), decipher.final()]).toString('utf8');
    return { value };
  }
  if (call.op === 'nativesecrets.encrypt') {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(call.secret), iv);
    const encrypted = Buffer.concat([cipher.update(call.value, 'utf8'), cipher.final()]);
    return {
      encryptedValue: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }
  if (call.op === 'nativesecrets.service') {
    const { openDatabase, migrateDatabase } = await import('../../../packages/gateway/src/db/connection.ts');
    const { UserSecretService } = await import('../../../packages/gateway/src/services/user-secrets.ts');
    const { db, sqlite } = await openDatabase(':memory:');
    const log = console.log; console.log = (...args) => console.error(...args);
    const RealDate = Date;
    let counter = 0;
    globalThis.Date = class extends RealDate {
      constructor(...args: any[]) { super(...(args.length ? args : [call.now + counter]) as [any]); counter += 1000; }
      static now() { return new RealDate(call.now + counter).getTime(); }
    } as DateConstructor;
    try {
      migrateDatabase(sqlite);
      if (call.seed) sqlite.exec(call.seed);
      const service = new UserSecretService(db, call.secret);
      const results: any[] = [];
      for (const step of call.steps) {
        try {
          if (step.op === 'save') results.push(service.save(step.params));
          else if (step.op === 'list') results.push(service.list(step.user ?? null, step.type));
          else if (step.op === 'get') results.push(service.getValue(step.user ?? null, step.type, step.key));
          else if (step.op === 'delete') results.push(service.delete(step.id, step.user ?? null));
          else throw new Error('unknown step');
        } catch (error) {
          results.push({ error: error instanceof Error ? error.message : String(error) });
        }
      }
      return { results };
    } finally {
      globalThis.Date = RealDate;
      sqlite.close();
      console.log = log;
    }
  }
  if (call.op === 'nativesecrets.routes') {
    const { openDatabase, migrateDatabase } = await import('../../../packages/gateway/src/db/connection.ts');
    const { UserService } = await import('../../../packages/gateway/src/services/users.ts');
    const { UserSecretService } = await import('../../../packages/gateway/src/services/user-secrets.ts');
    const { SecretInputService } = await import('../../../packages/gateway/src/services/secret-input.ts');
    const { registerSecretRoutes } = await import('../../../packages/gateway/src/routes/secrets.ts');
    const { signAuthToken } = await import('../../../packages/gateway/src/security/http-auth.ts');
    const { loadConfig } = await import('../../../packages/gateway/src/config.ts');
    const { db, sqlite } = await openDatabase(':memory:');
    const log = console.log; console.log = (...args) => console.error(...args);
    const ids: any = {};
    let app: any;
    const secretInput = new SecretInputService();
    const userSecrets = new UserSecretService(db, call.secret ?? 'secrets-fixture');
    const config = { ...loadConfig(), jwtSecret: call.secret ?? 'secrets-fixture', logLevel: 'silent' as const };
    try {
      migrateDatabase(sqlite);
      sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
      if (call.seed) sqlite.exec(call.seed);
      const { createServer } = await import('../../../packages/gateway/src/server.ts');
      app = await createServer(config, { sqlite, userService: new UserService(db) });
      registerSecretRoutes(app, config, secretInput, userSecrets);
      const base = await app.listen({ host: '127.0.0.1', port: 0 });
      const results = [];
      for (const step of call.steps) {
        if (step.request) {
          const pending = secretInput.requestSecret(step.request);
          ids[step.request.sessionId] = (await Promise.resolve(secretInput.listPending(undefined, step.request.userId ?? null))).at(-1)!.id;
          void pending;
          results.push(null);
          continue;
        }
        const path = step.path.replace(/\$([^/]+)/g, (_: any, key: any) => ids[key] ?? 'missing');
        const headers: any = { host: 'fixture.local', connection: 'close', ...step.headers };
        if (step.user) headers.authorization = 'Bearer ' + await signAuthToken({ id: step.user, username: step.user === 'owner' ? 'alice' : 'bob' }, config.jwtSecret);
        if (step.cookie) headers.cookie = 'jait_token=' + await signAuthToken({ id: step.cookie, username: 'alice' }, config.jwtSecret);
        let body: any;
        if (step.raw !== undefined) body = step.raw;
        else if ('body' in step) { body = JSON.stringify(step.body); headers['content-type'] ??= 'application/json'; }
        const res = await fetch(base + path, { method: step.method, headers, body, redirect: 'manual' });
        const raw = await res.text();
        let data: any = raw;
        try { data = JSON.parse(raw); } catch {}
        results.push({ status: res.status, body: data });
      }
      return { results };
    } finally {
      app?.server.closeAllConnections();
      await app?.close();
      sqlite.close();
      console.log = log;
    }
  }
  throw new Error('unknown driver operation');
}
