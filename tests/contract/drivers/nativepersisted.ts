import {serializePersistedToolCalls} from '../../../packages/gateway/src/lib/persisted-tool-calls.ts';
export async function dispatch(call:any){
  if(call.op!=='nativepersisted.serialize')throw new Error('unknown persisted-tool-calls operation');
  return serializePersistedToolCalls(call.raw,call.options);
}
