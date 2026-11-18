/** Node-compatible lifecycle for light-my-request under Bun 1.3.10.
 * Its response calls ServerResponse.end but Bun leaves writableEnded false,
 * which lets Fastify continue after a preHandler has already sent a response.
 * Track the actual end call only on injected responses; live servers are untouched.
 */
import { createRequire } from 'node:module';
if (typeof globalThis.Bun !== 'undefined') {
const gatewayRequire = createRequire(new URL('../../../packages/gateway/package.json', import.meta.url));
// Bun can reject a CommonJS require of ESM while the same dependency is still
// loading in a parallel ESM branch (subscription fetchers and matrix-bot-sdk).
// Finish the shared third-party module before importing the fixture graph.
await import(gatewayRequire.resolve('htmlparser2'));
const fastifyRequire = createRequire(gatewayRequire.resolve('fastify'));
const InjectedResponse = fastifyRequire('light-my-request/lib/response');
const ended = new WeakSet<object>();
const end = InjectedResponse.prototype.end;
InjectedResponse.prototype.end = function (...args: unknown[]) {
  ended.add(this);
  return end.apply(this, args);
};
Object.defineProperty(InjectedResponse.prototype, 'writableEnded', {
  configurable: true,
  get() { return ended.has(this); },
});
}
