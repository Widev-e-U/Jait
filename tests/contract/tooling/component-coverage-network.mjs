import { Socket } from 'node:net';
// Test-only TCP boundary. Test fixtures use ephemeral loopback ports. Do not
// connect to real provider/primary gateway defaults, LAN hosts or the Internet.
// This is a Node TCP guard, not an OS network namespace (e.g. subprocess UDP).
const reserved = new Set([9, 8000, 18789, 20128, 11434, 8178]);
export function allowedConnection(host, port) {
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host || 'localhost');
  return local && !reserved.has(Number(port));
}
const originalConnect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  // Unix sockets are left to the isolated HOME/state paths.
  const options = typeof first === 'object' ? first : { port: first, host: typeof normalized[1] === 'string' ? normalized[1] : 'localhost' };
  if (typeof first === 'string' && !/^\d+$/.test(first) || options?.path) return originalConnect.apply(this, args);
  if (!allowedConnection(options?.host, options?.port)) {
    const error = Object.assign(new Error('Component baseline blocked non-fixture TCP connection'), { code: 'ECONNREFUSED' });
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return originalConnect.apply(this, args);
};
