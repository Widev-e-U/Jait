/** Observations only: Rust owns timings, inputs, and expected results. */
import { UsageRefreshCache } from '../../../packages/gateway/src/services/usage-refresh-cache.ts';

interface Step { at: number; key: string; force?: boolean; value?: unknown; failure?: 'payload' | 'throw' }
interface Call { op: string; steps?: Step[]; value?: unknown; html?: string; quota?: unknown }
export async function dispatch(call: Call): Promise<unknown> {
  if (call.op === 'usagerefresh.steps') {
    let now = 0, loads = 0;
    const cache = new UsageRefreshCache<{ value: unknown; failed: boolean }>(() => now);
    const observations = [];
    for (const step of call.steps ?? []) {
      now = step.at;
      try {
        const result = await cache.run(step.key, async () => {
          loads += 1;
          if (step.failure === 'throw') throw new Error('provider unavailable');
          return { value: step.value, failed: step.failure === 'payload' };
        }, { force: step.force, failed: value => value.failed });
        observations.push({ loads, ...result });
      } catch (error) {
        observations.push({ loads, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return observations;
  }
  if (call.op === 'usagerefresh.concurrent') {
    let loads = 0;
    const cache = new UsageRefreshCache<unknown>();
    let release!: (value: unknown) => void;
    const load = () => { loads += 1; return new Promise(resolve => { release = resolve; }); };
    const first = cache.run('account', load);
    const second = cache.run('account', load, { force: true });
    await Promise.resolve();
    const before = loads;
    release(call.value);
    return { before, results: await Promise.all([first, second]), loads };
  }
  if (call.op === 'usagerefresh.route') {
    const { default: Fastify } = await import('../../../packages/gateway/node_modules/fastify');
    const { loadConfig } = await import('../../../packages/gateway/src/config.ts');
    const { registerProviderRoutes } = await import('../../../packages/gateway/src/routes/providers.ts');
    const { ProviderRegistry } = await import('../../../packages/gateway/src/providers/registry.ts');
    const { signAuthToken } = await import('../../../packages/gateway/src/security/http-auth.ts');
    const config = loadConfig();
    const app = Fastify({ logger: false });
    const keys = { OLLAMA_URL: 'http://localhost:11434', OLLAMA_SESSION_COOKIE: 'fixture-cookie' };
    let snapshots: unknown[] = [], loads = 0, records = 0;
    let release!: (response: Response) => void;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === 'http://localhost:11434/api/me') return new Response(null, { status: 404 });
      if (url !== 'https://ollama.com/settings') throw new Error(`Unexpected fixture request: ${url}`);
      loads += 1;
      if (loads === 1) return new Promise<Response>(resolve => { release = resolve; });
      return new Response(call.html);
    }) as typeof fetch;
    registerProviderRoutes(app, config, {
      providerRegistry: new ProviderRegistry(),
      userService: { getSettings: () => ({ apiKeys: keys }) } as never,
      providerUsageService: { listForUser: (ids: string[]) => snapshots.filter((item: any) => ids.includes(item.accountId)), recordOllamaUsage: () => { records += 1; } } as never,
    });
    try {
      const alice = await signAuthToken({ id: 'alice', username: 'alice' }, config.jwtSecret);
      const bob = await signAuthToken({ id: 'bob', username: 'bob' }, config.jwtSecret);
      const request = (token: string, suffix = '') => app.inject({ url: `/api/provider-usage/summary${suffix}`, headers: { authorization: `Bearer ${token}` } });
      const anonymous = (await app.inject({ url: '/api/provider-usage/summary' })).statusCode;
      const first = request(alice).then(result => result);
      const second = request(alice).then(result => result);
      for (let attempt = 0; !release && attempt < 100; attempt++) await Bun.sleep(1);
      if (!release) throw new Error('provider request did not start');
      const snapshotStatus = (await request(alice, '?refresh=0')).statusCode;
      const during = loads;
      release(new Response(call.html));
      const statuses = [(await first).statusCode, (await second).statusCode];
      snapshots = call.quota ? [call.quota] : [];
      const reopened = await request(alice);
      await request(alice, '?refresh=force');
      const afterReopen = loads;
      const bobResult = await request(bob);
      keys.OLLAMA_SESSION_COOKIE = 'changed-fixture-cookie';
      await request(alice);
      return { anonymous, snapshotStatus, during, statuses, afterReopen, loads, records,
        reopened: reopened.json(), bob: bobResult.json() };
    } finally { globalThis.fetch = originalFetch; await app.close(); }
  }
  throw new Error('unknown usage refresh operation');
}
