/** Test-only input construction and production calls; expected results live in Rust-owned vectors. */
import { limitSerializedJson, limitUtf8, serializeBoundedJson } from '../../../packages/gateway/src/lib/bounded-json.ts';
import { defaultCommandTimeoutMs, maxCommandTimeoutMs, resolveCommandTimeoutMs } from '../../../packages/gateway/src/lib/command-timeout.ts';

function materialize(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if ('$repeat' in value) return String(value.$repeat[0]).repeat(value.$repeat[1]);
  if ('$array' in value) return Array.from({ length: value.$array.count }, () => materialize(value.$array.value));
  if ('$entries' in value) return Object.fromEntries(Array.from({ length: value.$entries.count }, (_, i) => [`k${String(i).padStart(3, '0')}`, materialize(value.$entries.value)]));
  if ('$nest' in value) {
    let result = materialize(value.$nest.value);
    for (let i = 0; i < value.$nest.depth; i++) result = { child: result };
    return result;
  }
  if ('$bigint' in value) return BigInt(value.$bigint);
  if ('$undefined' in value) return undefined;
  if ('$function' in value) return () => undefined;
  if ('$symbol' in value) return Symbol('fixture');
  if ('$throwToJSON' in value) return { toJSON() { throw new Error('fixture toJSON'); }, value: materialize(value.$throwToJSON) };
  if ('$throwGetter' in value) return Object.defineProperty({}, 'value', { enumerable: true, get() { throw new Error('fixture getter'); } });
  if ('$cycle' in value) { const result: any = { name: 'cycle' }; result.self = result; return result; }
  if (Array.isArray(value)) return value.map(materialize);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item)]));
}

export async function dispatch(call: any): Promise<unknown> {
  const input = materialize(call.input);
  switch (call.op) {
    case 'boundaries.utf8': return limitUtf8(input, call.max, call.suffix);
    case 'boundaries.bounded':
      try { return { value: serializeBoundedJson(input, call.max) }; }
      catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    case 'boundaries.limit-json': return limitSerializedJson(input, call.max);
    case 'boundaries.timeout': {
      const names = ['JAIT_TERMINAL_TIMEOUT_MS', 'JAIT_TERMINAL_TIMEOUT_MAX_MS'] as const;
      const previous = names.map(name => process.env[name]);
      const warn = console.warn;
      const warnings: string[] = [];
      try {
        for (const name of names) {
          delete process.env[name];
          if (call.env?.[name] !== undefined) process.env[name] = call.env[name];
        }
        console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
        const value = call.special === 'NaN' ? NaN : call.special === 'Infinity' ? Infinity : call.special === '-Infinity' ? -Infinity : input;
        return { resolved: resolveCommandTimeoutMs(value), default: defaultCommandTimeoutMs(), max: maxCommandTimeoutMs(), warnings };
      } catch (error) {
        return { error: error instanceof Error ? error.name : String(error) };
      } finally {
        console.warn = warn;
        names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
      }
    }
    default: throw new Error('unknown boundary fixture operation');
  }
}
