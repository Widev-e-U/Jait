/** Actual Graphify runtime/runner. Only the published execute and ensure ports are scripted. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureGraphifyRuntime, inspectGraphifyRuntime, graphifyRuntimeFilesExist, getGraphifyRuntimePaths, resolveGraphifyCommand, GraphifyRuntimeError } from '../../../packages/gateway/src/services/code-graph/graphify-runtime.ts';
import { GraphifyRunner, GraphifyUnavailableError } from '../../../packages/gateway/src/services/code-graph/graphify-runner.ts';
const project = resolve(import.meta.dirname, '../../..');
function errorValue(error: any): any {
  if (!(error instanceof Error)) return { thrown: error };
  return { name: error.name, message: error.message, ...('code' in error ? { code: (error as any).code } : {}), ...('cause' in error ? { cause: errorValue(error.cause) } : {}) };
}
function scriptedError(response: any) {
  if ('thrown' in response) throw response.thrown;
  if (response.unavailable) throw new GraphifyUnavailableError(response.message);
  if (response.runtimeError) throw new GraphifyRuntimeError(response.runtimeError);
  if (response.error) {
    const error = Error(response.error.message ?? response.error);
    if (response.error.name) error.name = response.error.name;
    if ('code' in Object(response.error)) (error as any).code = response.error.code;
    throw error;
  }
}
function normalize(value: any, work: string): any {
  if (typeof value === 'string') return value.split(work).join('$WORK');
  if (Array.isArray(value)) return value.map(v => normalize(v, work));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, normalize(v, work)]));
  return value;
}
export async function dispatch(call: any) {
  const work = resolve(call.workspace);
  if (!work.startsWith(join(project, '.jait/artifacts/gateway-rust/code-graph/') )) throw Error('Graphify fixture workspace must stay in project artifacts');
  await mkdir(work, { recursive: true });
  const savedEnv = process.env; const OriginalDate = globalThis.Date;
  const now = call.test.clock ?? 1790000000123;
  globalThis.Date = class extends OriginalDate { constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); } static now() { return now; } } as any;
  const test = call.test;
  const env = { JAIT_STATE_DIR: join(work, 'state'), ...test.env };
  process.env = env;
  const events: any[] = []; let step = 0;
  const execute = async (command: string, args: string[], options: any) => {
    const signal = options?.signal;
    events.push({ command, args, options: { ...options, ...(signal ? { signal: { aborted: signal.aborted } } : {}) } });
    const response = test.responses?.[step++] ?? {};
    if (response.delay) await new Promise(r => setTimeout(r, response.delay));
    if (response.cancel && signal) controller.abort();
    scriptedError(response);
    return { stdout: response.stdout ?? '', stderr: response.stderr ?? '' };
  };
  const controller = new AbortController(); if (test.aborted) controller.abort();
  const jaitDir = join(work, 'state'); const paths = getGraphifyRuntimePaths(jaitDir);
  try {
    for (const file of test.files ?? []) {
      const destination = join(work, file); await mkdir(resolve(destination, '..'), { recursive: true }); await writeFile(destination, 'fixture');
    }
    let value;
    try {
      if (call.op === 'nativegraphify.paths') {
        value = { paths: getGraphifyRuntimePaths(test.jaitDir ?? jaitDir), command: resolveGraphifyCommand({ jaitDir: test.jaitDir ?? jaitDir, env }) };
      } else if (call.op === 'nativegraphify.runtime') {
        const options = { jaitDir, env, execute, onProgress(message: string) { events.push({ progress: message }); } };
        value = [];
        for (const action of test.actions ?? ['ensure']) {
          if (action === 'inspect') value.push(await inspectGraphifyRuntime(options));
          else if (action === 'files') value.push(await graphifyRuntimeFilesExist(jaitDir));
          else if (action === 'parallel') value.push(await Promise.all([ensureGraphifyRuntime(options), ensureGraphifyRuntime(options)]));
          else value.push(await ensureGraphifyRuntime(options));
        }
      } else {
        const options: any = { execute };
        if ('command' in test) options.command = test.command;
        if (test.ensure) options.ensureRuntime = async () => { events.push({ ensure: true }); scriptedError(test.ensure); };
        const runner = new GraphifyRunner(options);
        value = test.versionOnly ? await runner.getVersion(join(work, 'project')) : await runner.build({ projectRoot: join(work, 'project'), outputDir: join(work, 'output'), ...(test.noSignal ? {} : { signal: controller.signal }) });
      }
      value = { result: value };
    } catch (error) { value = { error: errorValue(error) }; }
    let metadata = null; let metadataText = null;
    try { metadataText = await readFile(paths.metadataPath, 'utf8'); metadata = JSON.parse(metadataText); } catch {}
    return normalize({ ...value, events, consumed: step, metadata, metadataText, runtimeExists: existsSync(paths.runtimeDir), outputExists: existsSync(join(work, 'output')), aborted: controller.signal.aborted }, work);
  } finally { process.env = savedEnv; globalThis.Date = OriginalDate; }
}
