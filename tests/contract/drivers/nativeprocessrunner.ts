/** Execute the reference's actual private helper, without importing host config or Docker. */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const source = readFileSync(new URL('../../../packages/gateway/src/security/sandbox-manager.ts', import.meta.url), 'utf8');
function load(name: string, next: string): (...args: unknown[]) => Promise<unknown> {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`\nasync function ${next}(`, start);
  if (start < 0 || end <= start) throw new Error('reference helper boundary changed');
  const javascript = new Bun.Transpiler({loader: 'ts'}).transformSync(source.slice(start, end));
  return new Function('spawn', `${javascript}; return ${name};`)(spawn);
}
const run = load('runDockerProcess', 'buildBrowserSandboxImage');
const runInput = load('runProcessWithInput', 'waitForPort');
export async function dispatch(call: {op: string; argv: string[]; timeoutMs: number; input?: string}) {
  if (call.op !== 'nativeprocessrunner.run') throw new Error('unknown process runner operation');
  return call.input === undefined ? run(call.argv, call.timeoutMs) : runInput(call.argv, call.timeoutMs, call.input);
}
