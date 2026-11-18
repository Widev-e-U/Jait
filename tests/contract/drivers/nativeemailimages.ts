/** Fixture-owned DNS/HTTPS for the real mail-image and public-mail-server exports. */
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { loadMailImage } from '../../../packages/gateway/src/services/email/remote-images.ts';
import { publicMailServer } from '../../../packages/gateway/src/services/email/connection.ts';

export async function dispatch(call: Record<string, any>): Promise<unknown> {
  if (call.op !== 'nativeemailimages.load') throw new Error('unknown nativeemailimages operation');
  const resolves: unknown[] = [], requests: unknown[] = [], timers: number[] = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
    timers.push(delay ?? 0);
    return realSetTimeout(callback, Math.min(delay ?? 0, 50), ...args);
  }) as typeof setTimeout;
  try {
    const resolve = async (hostname: string, options: unknown) => {
      resolves.push({ hostname, options });
      if (call.dnsError) throw new Error(call.dnsError);
      if (call.dnsHang) return new Promise<never>(() => {});
      return (call.addresses ?? ['1.1.1.1']).map((address: string) => ({ address, family: address.includes(':') ? 6 : 4 }));
    };
    const request = ((options: unknown, callback: (res: Readable) => void) => {
      requests.push(options);
      const req = new EventEmitter() as EventEmitter & { end(): void; destroy(error: Error): void };
      req.destroy = error => { req.emit('error', error); req.emit('close'); };
      req.end = () => {
        if (call.requestHang) return;
        if (call.requestError) { req.destroy(new Error(call.requestError)); return; }
        const chunks = call.byteChunks?.map((chunk: number[]) => Buffer.from(chunk)) ?? [Buffer.from(call.body ?? 'image-bytes')];
        if (call.repeatBytes) chunks.push(Buffer.alloc(call.repeatBytes));
        const res = Readable.from(chunks) as Readable & { statusCode: number; headers: Record<string, string> };
        res.statusCode = call.status ?? 200;
        res.headers = { 'content-type': call.contentType ?? 'image/png' };
        res.on('close', () => req.emit('close'));
        callback(res);
        if (call.bodyError) res.destroy(new Error(call.bodyError));
      };
      return req;
    }) as any;
    const value = await loadMailImage(call.url, { request, publicMailServer: config => publicMailServer(config, resolve) });
    return { ok: true, value: call.summarize ? { length: value.length, sha256: createHash('sha256').update(value).digest('hex') } : value, resolves, requests, timers };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), resolves, requests, timers };
  } finally { globalThis.setTimeout = realSetTimeout; }
}
