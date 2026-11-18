/**
 * Reference bridge for the `jait-models` lane.
 *
 * The driver invokes the **real** `packages/gateway/src/services/jait-models.ts`
 * (`listJaitModels`) and the **real** `packages/shared` id helpers, and the **real**
 * `OPENROUTER_MODELS` catalogue. The only thing that is replaced is the
 * `../providers/model-fetchers.js` import — the documented component boundary — which is
 * rewritten to a controlled peer module backed by per-call scripted responses. No live
 * network, no secrets: every "fetch" is a synchronous record plus a scripted value/throw.
 *
 * The rewritten copy lives under the lane artifact directory, never in the source tree.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/+$/, '');
const laneDirectory = `${repositoryRoot}/.jait/artifacts/gateway-rust/parallel-20261020/jait-models`;
const sharedUrl = pathToFileURL(`${repositoryRoot}/packages/shared/src/index.ts`).href;
const providerUrl = pathToFileURL(`${repositoryRoot}/packages/gateway/src/providers/jait-provider.ts`).href;
const servicePath = `${repositoryRoot}/packages/gateway/src/services/jait-models.ts`;

const peersSource = [
  '// Controlled stand-in for ../providers/model-fetchers.js (component boundary).',
  'const state = globalThis as any;',
  'function respond(source: string, args: unknown[]) {',
  '  state.__jaitModelsCalls.push({ source, args });',
  '  const entry = (state.__jaitModelsScript ?? {})[source];',
  '  if (!entry) return [];',
  '  if (entry.error) throw new Error(String(entry.error));',
  '  return entry.models ?? [];',
  '}',
  'export async function fetchOpenAIModels(apiKey: string, baseUrl: string) { return respond("openai", [apiKey, baseUrl]); }',
  'export async function fetchOpenRouterModels(apiKey: string) { return respond("openrouter", [apiKey]); }',
  'export async function fetchOllamaModels(baseUrl: string, options: unknown) { return respond("ollama", [baseUrl, options]); }',
  'export async function fetchOmniRouteModels(apiKey: string, baseUrl: string) { return respond("omniroute", [apiKey, baseUrl]); }',
  '',
].join('\n');

const state = globalThis as any;
state.__jaitModelsScript = {};
state.__jaitModelsCalls = [];

let referencePromise: Promise<any> | undefined;

async function reference(): Promise<any> {
  if (!referencePromise) {
    referencePromise = (async () => {
      mkdirSync(laneDirectory, { recursive: true });
      writeFileSync(`${laneDirectory}/peers.ts`, peersSource);
      let source = readFileSync(servicePath, 'utf8');
      source = source
        .replace('from "@jait/shared"', `from "${sharedUrl}"`)
        .replace('from "../providers/model-fetchers.js"', 'from "./peers.ts"')
        .replaceAll('"../providers/jait-provider.js"', `"${providerUrl}"`);
      writeFileSync(`${laneDirectory}/reference.ts`, source);
      return import(pathToFileURL(`${laneDirectory}/reference.ts`).href);
    })();
  }
  return referencePromise;
}

const CONFIG_DEFAULTS: Record<string, string> = {
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  ollamaUrl: 'http://localhost:11434',
  omnirouteBaseUrl: 'http://localhost:20128/v1',
  omnirouteApiKey: '',
};

/** Mirrors `DEFAULT_CONFIG` so a vector may omit values without changing truthiness. */
function configFrom(raw: unknown): Record<string, string> {
  const config: Record<string, string> = { ...CONFIG_DEFAULTS };
  for (const [key, value] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    if (typeof value === 'string') config[key] = value;
  }
  return config;
}

export async function dispatch(call: any): Promise<unknown> {
  const action = String(call.op ?? '').replace(/^nativejaitmodels\./, '');
  const payload = call.payload ?? {};
  switch (action) {
    case 'list': {
      state.__jaitModelsScript = payload.script ?? {};
      state.__jaitModelsCalls = [];
      const service = await reference();
      const models = await service.listJaitModels({
        config: configFrom(payload.config),
        apiKeys: payload.apiKeys,
        fallbackModels: payload.fallbackModels ?? [],
        includeCloud: payload.includeCloud,
      });
      return { models, calls: state.__jaitModelsCalls };
    }
    case 'parse': {
      const shared = await import(sharedUrl);
      return { instances: shared.parseJaitBackendInstances(payload.raw) };
    }
    case 'normalize': {
      const shared = await import(sharedUrl);
      return { baseUrl: shared.normalizeJaitBackendBaseUrl(payload.raw, payload.backend) };
    }
    case 'encode': {
      const shared = await import(sharedUrl);
      return { id: shared.encodeJaitModelId(payload.backend, payload.instanceId, payload.model) };
    }
    case 'decode': {
      const shared = await import(sharedUrl);
      return { decoded: shared.decodeJaitModelId(payload.value) ?? null };
    }
    case 'catalogue': {
      const provider = await import(providerUrl);
      return { models: provider.OPENROUTER_MODELS };
    }
    case 'trim': {
      // Reference whitespace/trim parity probe for the `js_trim` used by this component.
      return { raw: payload.raw, trimmed: String(payload.raw ?? '').trim() };
    }
    default:
      throw new Error(`unknown jait-models driver op: ${String(call.op)}`);
  }
}
