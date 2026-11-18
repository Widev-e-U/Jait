/** Completion transport is injected; the actual notification source constructs all prompts. */
import { mock } from 'bun:test';
const units = (text: string) => text.split('').map(c => c.charCodeAt(0));
let active: any;
mock.module('../../../packages/gateway/src/services/jait-llm.ts', () => ({
  callJaitLlmCompletion: async (config: any, messages: any[], options: any) => {
    active.calls.push({config,messages:messages.map(m=>({role:m.role,units:units(m.content)})),maxTokens:options.maxTokens,temperature:options.temperature});
    active.signal=options.signal;
    if(active.mode==='failure') throw new Error('private backend detail');
    if(active.mode==='timeout') return await new Promise((_resolve,reject)=> {
      options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
      queueMicrotask(()=>[...active.timers.values()][0]());
    });
    return active.raw;
  },
}));
const { normalizeNotificationDetail, generateChatNotificationDetail } = await import('../../../packages/gateway/src/services/chat-notification.ts');
export async function dispatch(call: any): Promise<any> {
  if(call.op==='nativenotification.normalize') {const value=normalizeNotificationDetail(call.raw);return value===null?null:units(value);}
  if(call.op!=='nativenotification.generate') throw new Error('unknown notification operation');
  active={calls:[],mode:call.mode??'success',raw:call.raw??'done',timers:new Map(),scheduled:[],cleared:0};
  const savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout;
  let next=1;
  globalThis.setTimeout=((fn: ()=>void,delay:number)=>{const id=next++;active.timers.set(id,fn);active.scheduled.push(delay);return id;}) as any;
  globalThis.clearTimeout=((id:number)=>{active.cleared++;active.timers.delete(id);}) as any;
  try {
    const value=await generateChatNotificationDetail(call.options);
    return {result:value===null?null:units(value),calls:active.calls,scheduled:active.scheduled,cleared:active.cleared,remaining:active.timers.size,aborted:active.signal?.aborted??false};
  } finally {globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear;}
}
