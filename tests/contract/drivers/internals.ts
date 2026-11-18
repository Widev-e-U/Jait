/** Test-only bridge: inputs and assertions belong to Rust; production functions run here.
 * This is deliberately not a production RPC interface or a future Rust gateway API.
 */
import {
  AUTH_COOKIE_NAME, extractBearerToken, isPublicApiPath, signAuthToken, verifyAuthToken,
} from '../../../packages/gateway/src/security/http-auth.ts';
import { classifyIrreversibleCommand } from '../../../packages/gateway/src/security/tool-permissions.ts';
import * as jose from '../../../packages/gateway/node_modules/jose';

const MAX_INPUT = 65_536;
let size = 0;
const chunks: Uint8Array[] = [];
for await (const chunk of Bun.stdin.stream()) {
  size += chunk.byteLength;
  if (size > MAX_INPUT) throw new Error('driver input exceeds 64 KiB');
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (input.version !== 1 || !Array.isArray(input.calls) || input.calls.length > 64) {
  throw new Error('unsupported driver protocol or call count');
}
const results = [];
for (const call of input.calls) {
  switch (call.op) {
    case 'auth.public': results.push(isPublicApiPath(call.path)); break;
    case 'auth.bearer': results.push(extractBearerToken(call.header)); break;
    case 'auth.cookie': results.push(AUTH_COOKIE_NAME); break;
    case 'auth.roundtrip': {
      const token = await signAuthToken(call.user, call.secret);
      results.push(await verifyAuthToken(token, call.verifySecret ?? call.secret));
      break;
    }
    case 'auth.verify': results.push(await verifyAuthToken(call.token, call.secret)); break;
    case 'auth.claims': {
      // Deliberately prepare independently signed fixtures, as the original Vitest does.
      const token = await new jose.SignJWT(call.claims)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(call.subject).setIssuedAt().setExpirationTime('7d')
        .sign(new TextEncoder().encode(call.secret));
      results.push(await verifyAuthToken(token, call.secret));
      break;
    }
    case 'command.classify': results.push(classifyIrreversibleCommand(call.command)); break;
    default: {
      const prefix = typeof call.op === 'string' ? call.op.split('.')[0] : '';
      // Lane-owned drivers are resolved by prefix so adding a lane never edits this bridge.
      if (!/^[a-z][a-z0-9]{0,23}$/.test(prefix)) throw new Error('unknown driver operation');
      // Bun can race a CJS require against this pure ESM parser's module job
      // when a server fixture imports Matrix. Settle the real parser first;
      // no stubs, package edits, connector startup or network effects.
      const {createRequire} = await import('node:module');
      const gatewayRequire=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
      const matrixRequire=createRequire(gatewayRequire.resolve('matrix-bot-sdk'));
      const sanitizerRequire=createRequire(matrixRequire.resolve('sanitize-html'));
      await import(sanitizerRequire.resolve('htmlparser2'));
      let adapter: { dispatch?: (call: unknown) => unknown };
      try {
        adapter = await import(`./${prefix}.ts`);
      } catch {
        throw new Error('unknown driver operation');
      }
      if (typeof adapter.dispatch !== 'function') throw new Error('unknown driver operation');
      results.push(await adapter.dispatch(call));
    }
  }
}
const output = JSON.stringify({ version: 1, results });
if (Buffer.byteLength(output) > 262_144) throw new Error('driver output exceeds 256 KiB');
process.stdout.write(output);
