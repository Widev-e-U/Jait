/** Lane `network-resources`: real TS exports under a controlled host.
 *
 * `node:child_process.execFile`, `node:fs.existsSync`, `node:os.homedir` /
 * `node:os.platform`, `process.env.DOCKER_HOST` and `Date` are replaced so the
 * production functions run unmodified while the contract suite owns argv,
 * endpoint resolution, time and the scripted Docker peer responses.
 *
 * Operations:
 *  - `nativenetworkresources.resource` → `containerResource` for one row.
 *  - `nativenetworkresources.inventory` → one `DockerResourceInventory`, N
 *    sequential `get()` calls at scripted instants (`nows`), or 3 concurrent
 *    `get()` calls with `mode: "concurrent"` (coalescing).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
let active: any = null;
type Response = { stdout?: string; stderr?: string; error?: { code?: string; message?: string } };
// Bun builtin-module mocks do not replace the execFile binding reliably. Rewrite
// only dependency imports in an owned test copy; execute every reference body.
const original = readFileSync(new URL('../../../packages/gateway/src/services/network-resources.ts', import.meta.url), 'utf8');
let reference = original;
for (const module of ['node:child_process', 'node:fs', 'node:os']) {
  const token = `from '${module}'`;
  if (reference.split(token).length !== 2) throw new Error(`unexpected reference import: ${module}`);
  reference = reference.replace(token, "from './peers.ts'");
}
const directory = new URL(`../../../.jait/artifacts/gateway-rust/parallel-20261020/network-resources/reference-${process.pid}/`, import.meta.url);
mkdirSync(directory, { recursive: true });
async function fixtureResponse() {
  const response: Response = active.responses.length ? active.responses.shift() : {};
  if (response.error) { const error: any = new Error(response.error.message ?? 'spawn failed'); if (response.error.code) error.code = response.error.code; throw error; }
  return { stdout: response.stdout ?? '', stderr: response.stderr ?? '' };
}
const peers = {
  existsSync: (path: string) => { active.sockets.push(path); return active.socketExists; },
  homedir: () => active.home,
  platform: () => active.platform,
  execFile: async (file: string, args: string[], options: any) => {
    active.calls.push([file, ...args]); active.options.push(options);
    return fixtureResponse();
  },
};
(globalThis as any).__jaitContractNetworkPeers = peers;
writeFileSync(new URL('peers.ts', directory), `
const peers = globalThis.__jaitContractNetworkPeers;
export const existsSync = path => peers.existsSync(path);
export const homedir = () => peers.homedir();
export const platform = () => peers.platform();
export const execFile = () => { throw new Error('unexpected callback invocation'); };
execFile[Symbol.for('nodejs.util.promisify.custom')] = (...args) => peers.execFile(...args);
`);
writeFileSync(new URL('reference.ts', directory), reference);
const { containerResource, DockerResourceInventory } = await import(fileURLToPath(new URL('reference.ts', directory)));

const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) super(active.now);
    else super(...(args as [any]));
  }
  static now() {
    return active.now;
  }
}

function scenario(call: any) {
  const nows: number[] = Array.isArray(call.nows) && call.nows.length ? call.nows : [call.now ?? 0];
  return {
    calls: [] as string[][],
    options: [] as any[],
    sockets: [] as string[],
    responses: (call.responses ?? []).map((response: Response) => ({ ...response })),
    socketExists: call.host?.socketExists === true,
    home: call.host?.home ?? '/owned/home',
    platform: call.host?.platform ?? 'linux',
    now: nows[0],
    nows,
  };
}

export async function dispatch(call: any): Promise<any> {
  if (call.op === 'nativenetworkresources.wire') return JSON.stringify(containerResource(call.value, call.observedAt));
  if (call.op === 'nativenetworkresources.resource') {
    return { resource: containerResource(call.value, call.observedAt) };
  }
  if (call.op !== 'nativenetworkresources.inventory') throw new Error('unknown operation');
  active = scenario(call);
  const beforeHost = process.env.DOCKER_HOST;
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: active.platform, configurable: true });
  if (call.host?.dockerHost == null) delete process.env.DOCKER_HOST;
  else process.env.DOCKER_HOST = call.host.dockerHost;
  globalThis.Date = FixedDate as any;
  try {
    const inventory = call.host === undefined ? new DockerResourceInventory(async (args: string[]) => {
      active.calls.push(args);
      return (await fixtureResponse()).stdout;
    }) : new DockerResourceInventory();
    const results: any[] = [];
    if (call.mode === 'concurrent') {
      active.now = active.nows[0];
      const concurrent = await Promise.all([inventory.get(), inventory.get(), inventory.get()]);
      results.push(...concurrent);
    } else {
      for (const now of active.nows) {
        active.now = now;
        results.push(await inventory.get());
      }
    }
    return {
      inventory: results.at(-1),
      results,
      calls: active.calls,
      options: active.options,
      sockets: active.sockets,
    };
  } finally {
    globalThis.Date = RealDate;
    Object.defineProperty(process, 'platform', platformDescriptor);
    if (beforeHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = beforeHost;
  }
}
