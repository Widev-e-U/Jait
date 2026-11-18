/** Test-only lane driver for the native ACP registry port.
 *
 * Runs the real `packages/gateway/src/providers/acp-registry.ts` exports against owned loopback
 * HTTP fixtures. Inputs, fixtures and assertions belong to Rust; production behaviour runs here.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  loadAcpRegistryProviderConfigs,
  parseAcpRegistry,
} from '../../../packages/gateway/src/providers/acp-registry.ts';

const OK_REGISTRY = {
  schemaVersion: 1,
  agents: [
    {
      id: 'codex-acp',
      name: 'Zed Codex',
      version: '1.2.3',
      description: 'Codex agent',
      icon: 'https://icons.test/codex.png',
      website: 'https://codex.test/docs',
      repository: 'http://insecure.test/repo',
      distribution: {
        npx: {
          package: ' @zed/codex-acp ',
          args: ['--stdio', 'bad\narg', 7],
          env: { CODEX_HOME: '/x', '1bad': 'y', OK_NUM: 3 },
        },
      },
    },
    {
      id: 'gemini',
      name: 'alpha Gemini',
      version: ' 2.0.0 ',
      description: ' Gemini agent ',
      distribution: { uvx: { package: 'gemini-acp', args: [] } },
    },
  ],
};
const OK_BODY = JSON.stringify(OK_REGISTRY);

type RouteResult = { status: number; body: string | Uint8Array; delayMs?: number };

function routeResult(route: string, first: boolean): RouteResult {
  switch (route) {
    case 'bom':
      return { status: 200, body: `\ufeff${OK_BODY}` };
    case 'invalid-oversize': {
      const prefix = new TextEncoder().encode(`${OK_BODY.slice(0, -1)},"pad":"`);
      const bytes = new Uint8Array(prefix.length + 800_002);
      bytes.set(prefix); bytes.fill(255, prefix.length, prefix.length + 800_000);
      bytes.set(new TextEncoder().encode('"}'), prefix.length + 800_000);
      return { status: 200, body: bytes };
    }
    case 'redirect':
    case 'ok':
      return { status: 200, body: OK_BODY };
    case 'switch':
      return first ? { status: 200, body: OK_BODY } : { status: 500, body: '{"error":"boom"}' };
    case 'http500':
      return { status: 500, body: '{"error":"boom"}' };
    case 'http404':
      return { status: 404, body: 'missing' };
    case 'badjson':
      return { status: 200, body: 'not json at all' };
    case 'empty':
      return { status: 200, body: '{"agents":[]}' };
    case 'notobject':
      return { status: 200, body: '[1,2,3]' };
    case 'oversize':
      return { status: 200, body: `{"agents":[],"pad":"${'x'.repeat(2 * 1024 * 1024)}"}` };
    case 'slowOk':
      return { status: 200, body: OK_BODY, delayMs: 400 };
    default:
      return { status: 404, body: 'unknown route' };
  }
}

function closedPort(): number {
  const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('') });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

async function withServer(
  route: string,
  run: (
    base: string,
    state: { requests: () => number; headers: () => unknown },
  ) => Promise<unknown>,
): Promise<unknown> {
  let requests = 0;
  let headers: unknown = null;
  let first = true;
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request: Request) {
      requests += 1;
      headers = {
        accept: request.headers.get('accept'),
        userAgent: request.headers.get('user-agent'),
      };
      const url = new URL(request.url);
      if (url.pathname !== '/registry.json') return new Response('missing', { status: 404 });
      if (route === 'redirect') {
        const hop = Number(url.searchParams.get('hop') ?? 0);
        if (hop < 12) return new Response(null, {status: 302, headers: {Location: `/registry.json?hop=${hop + 1}`}});
      }
      const result = routeResult(route, first);
      first = false;
      if (result.delayMs) await Bun.sleep(result.delayMs);
      return new Response(result.body, {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  try {
    return await run(`http://127.0.0.1:${server.port}/registry.json`, {
      requests: () => requests,
      headers: () => headers,
    });
  } finally {
    server.stop(true);
  }
}

async function cacheInfo(path: string | null) {
  if (!path) return null;
  try {
    const text = await readFile(path, 'utf8');
    const file = await stat(path);
    const directory = await stat(dirname(path));
    return { exists: true, text, mode: file.mode & 0o777, dirMode: directory.mode & 0o777 };
  } catch {
    return { exists: false };
  }
}

async function invoke(scenario: any, url: string, cachePath: string | null) {
  const options: any = {
    force: scenario.force === true,
    fallbackDefinitions: scenario.fallback ?? [],
    preferFallbackDefinitions: scenario.prefer === true,
  };
  if (scenario.registryUrlMode !== 'env') options.registryUrl = url;
  if (scenario.cache === 'null') options.cacheFile = null;
  else if (scenario.cache === 'explicit') options.cacheFile = cachePath;
  if (scenario.fetchTimeout === true) {
    options.fetchImpl = async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
  }
  const once = async () => {
    try {
      return { ok: await loadAcpRegistryProviderConfigs(options) };
    } catch (error: any) {
      return { error: String(error?.message ?? error) };
    }
  };
  const concurrency = Number(scenario.concurrency ?? 0);
  if (concurrency > 1) {
    return await Promise.all(Array.from({ length: concurrency }, once));
  }
  const sequential = Math.max(1, Number(scenario.sequential ?? 1));
  const results = [];
  const originalNow = Date.now;
  try {
    for (let index = 0; index < sequential; index += 1) {
      if (scenario.clockTimes) Date.now = () => Number(scenario.clockTimes[index]);
      results.push(await once());
    }
    return results;
  } finally {
    Date.now = originalNow;
  }
}

async function runLoad(scenario: any) {
  const cachePath: string | null = scenario.cachePath ?? null;
  if (cachePath && typeof scenario.cacheSeed === 'string') {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, scenario.cacheSeed);
  }
  const warnings: any[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const detail =
      args.length > 1 ? (args[1] instanceof Error ? args[1].message : String(args[1])) : '';
    warnings.push({
      message: String(args[0] ?? ''),
      detailKind: detail.startsWith('ACP registry') ? detail : 'other',
    });
  };
  try {
    let outcome: { results: any[]; requests: number; headers: unknown };
    if (scenario.route === 'refused') {
      const url = `http://127.0.0.1:${closedPort()}/registry.json`;
      outcome = { results: (await invoke(scenario, url, cachePath)) as any[], requests: 0, headers: null };
    } else {
      outcome = (await withServer(scenario.route, async (url, state) => ({
        results: (await invoke(scenario, url, cachePath)) as any[],
        requests: state.requests(),
        headers: state.headers(),
      }))) as any;
    }
    return {
      results: outcome.results,
      warns: warnings,
      requests: outcome.requests,
      headers: outcome.headers,
      cache: await cacheInfo(cachePath),
      cachePath,
    };
  } finally {
    console.warn = originalWarn;
  }
}

function runParse(call: any) {
  const values = Array.isArray(call.values) ? call.values : [];
  return values.map((value: unknown) => {
    try {
      const providers = parseAcpRegistry(value);
      return { ok: call.launchProjection ? providers.map((provider) => provider.registry?.distribution === 'binary'
        ? { ...provider, command: 'test-launcher', args: provider.args?.slice(1) }
        : provider) : providers };
    } catch (error: any) {
      return { error: String(error?.message ?? error) };
    }
  });
}

async function withEnv(overrides: Record<string, unknown>, run: () => Promise<unknown> | unknown) {
  const saved: [string, string | undefined][] = [];
  for (const [key, value] of Object.entries(overrides ?? {})) {
    saved.push([key, process.env[key]]);
    if (value === null || value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export async function dispatch(call: any) {
  switch (call?.op) {
    case 'nativeacpregistry.load':
      return await withEnv(call.scenario?.env ?? {}, () => runLoad(call.scenario ?? {}));
    case 'nativeacpregistry.parse':
      return await withEnv(call.env ?? {}, () => runParse(call));
    default:
      throw new Error('unknown driver operation');
  }
}
