/** Native auth reference transport. No expected results or native implementation here. */
import * as auth from '../../../packages/gateway/src/security/http-auth.ts';
import { assertOwnership } from '../../../packages/gateway/src/security/ownership.ts';
import { createHmac } from 'node:crypto';
type Call = {
  op: string; now?: number; secret?: string; token?: string;
  encoding?: string; payload?: unknown; header?: Record<string, unknown>; user?: auth.AuthUser;
  authorization?: unknown; cookie?: string; resource?: {userId: string | null} | null;
  userId?: string; message?: string;
};
export async function dispatch(call: Call): Promise<unknown> {
  const DateOriginal = globalThis.Date;
  if (call.now !== undefined) {
    const fixed = call.now * 1000;
    globalThis.Date = class extends DateOriginal {
      constructor(value?: string | number) { super(value === undefined ? fixed : value); }
      static now() { return fixed; }
    } as DateConstructor;
  }
  try {
    if (call.op === 'nativeauth.fixture') {
      const encode = (text: string) => {
        const raw = Buffer.from(text).toString('base64url');
        if (call.encoding === 'padding') return raw + '='.repeat((4 - raw.length % 4) % 4);
        if (call.encoding === 'whitespace') return ' \t' + raw + '\n';
        return raw;
      };
      const header = encode(JSON.stringify(call.header ?? {alg:'HS256',typ:'JWT'}));
      const payload = encode(JSON.stringify(call.payload));
      const data = header + '.' + payload;
      let signature = createHmac('sha256', call.secret ?? '').update(data).digest('base64url');
      if (call.encoding === 'padding') signature += '=';
      if (call.encoding === 'whitespace') signature = ' \t' + signature + '\n';
      const token = data + '.' + signature;
      return { token, user: await auth.verifyAuthToken(token, call.secret ?? '') };
    }
    if (call.op === 'nativeauth.sign') {
      try { return {token: await auth.signAuthToken(call.user!, call.secret!)}; }
      catch (e) { return {error: e instanceof Error ? e.message : String(e)}; }
    }
    if (call.op === 'nativeauth.verify') return auth.verifyAuthToken(call.token!, call.secret!);
    if (call.op === 'nativeauth.resolve' || call.op === 'nativeauth.require') {
      const request = {headers:{authorization:call.authorization},cookies:{[auth.AUTH_COOKIE_NAME]:call.cookie}};
      let status = 200, body: unknown = null;
      const reply = { status(value: number) {status=value;return this;}, send(value: unknown) {body=value;return this;} };
      const user = call.op === 'nativeauth.resolve'
        ? await auth.resolveAuth(request as any, call.secret!)
        : await auth.requireAuth(request as any, reply as any, call.secret!);
      return {user,status,body};
    }
    if (call.op === 'nativeauth.owner') {
      let status = 200, body: unknown = null;
      const reply = { status(value: number) {status=value;return this;}, send(value: unknown) {body=value;return this;} };
      const allowed = assertOwnership(reply as any, call.resource, call.userId!, call.message!);
      return {allowed,status,body};
    }
    throw new Error('unknown native auth operation');
  } finally { globalThis.Date = DateOriginal; }
}
