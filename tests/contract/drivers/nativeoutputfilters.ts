/** Actual production output filters. Encode strings as UTF-16 code units so a
 * deliberate JS slice through a surrogate pair remains observable to Rust. */
import { dispatch as filters } from './filters.ts';
function units(value: unknown): unknown {
  if (typeof value === 'string') return {utf16: Array.from({length:value.length},(_,i)=>value.charCodeAt(i))};
  if (Array.isArray(value)) return value.map(units);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,units(v)]));
  return value;
}
export async function dispatch(call: any) {
  return units(await filters({...call,op:call.op.replace('nativeoutputfilters.','filters.')}));
}
