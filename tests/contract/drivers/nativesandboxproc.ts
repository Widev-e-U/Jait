/** Actual reference process policy; deterministic transport/timers only. */
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
let loaded:Promise<any>|undefined;
async function factory(){return loaded??=(async()=>{
 let source=await Bun.file(new URL('../../../packages/gateway/src/security/sandbox-background-process.ts',import.meta.url)).text();
 for(const [from,to] of [
 ['import { spawn } from "node:child_process";','const spawn=()=>{throw Error("unexpected default spawn")};'],
 ['import { randomUUID } from "node:crypto";','const randomUUID=()=>"fixture-uuid";'],
 ]){if(source.split(from).length!==2)throw Error('Sandbox process binding changed');source=source.replace(from,to);}
 const code=new Bun.Transpiler({loader:'ts'}).transformSync(source);
 const path=new URL('../../../.jait/artifacts/gateway-rust/sandbox-process/fixtures/'+createHash('sha256').update(code).digest('hex')+'.mjs',import.meta.url);
 await Bun.write(path,code);return import(path.href);
})();}
function signature(text:string){const bytes=Buffer.alloc(text.length*2);for(let i=0;i<text.length;i++)bytes.writeUInt16LE(text.charCodeAt(i),i*2);return {length:text.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
function result(r:any){return r===null?null:{...r,output:signature(r.output)};}
async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
export async function dispatch(call:any){if(call.op==='nativesandboxproc.capacity')return capacity();const module=await factory(),results=[];
for(const test of call.cases){
 let now=0,next=0,outcome:any=null,endedAt:any=null,error:any=null,stops=0;
 const timers=new Map<number,{at:number,fn:()=>void}>(),launches:any[]=[],kills:any[]=[],chunks:any[]=[],children:any[]=[],runnerInvocations:any[]=[];
 const savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout;
 globalThis.setTimeout=((fn:any,ms:any)=>{const id=++next;timers.set(id,{at:now+Math.max(1,Number(ms)||1),fn});return {id,unref(){}};})as any;
 globalThis.clearTimeout=((timer:any)=>{timers.delete(timer?.id??timer);})as any;
 async function advance(at:number){for(;;){const entry=[...timers].filter(([,v])=>v.at<=at).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!entry)break;timers.delete(entry[0]);now=entry[1].at;entry[1].fn();await flush();}now=at;await flush();}
 const spawn=(executable:string,args:string[],options:any)=>{
  const index=children.length;if(test.spawnError===index)throw Error('launch failed');
  launches.push({at:now,executable,arguments:args,capture_output:options.stdio!=='ignore',windows_hide:options.windowsHide});
  const child:any=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=(signal:string)=>{kills.push({at:now,index,signal});};children.push(child);
  if(options.stdio==='ignore'&&test.cleanupDelay!==null)setTimeout(()=>child.emit(test.cleanupError?'error':'close',test.cleanupError?Error('cleanup error'):0),test.cleanupDelay??1);
  return child;
 };
 let execution:any=null,unsubscribe:any=null,resolve:any,reject:any;
 try{
  if(test.executor){const run=(invocation:any,timeout:any)=>{runnerInvocations.push({invocation,timeout});return new Promise((a,b)=>{resolve=a;reject=b;});};execution=module.startExecutorBackedBackgroundCommand(run,['fake','exec','container','bash','-lc','echo hi'],'container',test.timeout??10000);}
  else execution=module.startSandboxBackgroundProcess(['fake','exec','container','bash','-lc',test.command??'echo hi'],'container',test.timeout??10000,test.remove??false,{spawn});
  unsubscribe=execution.onOutput((s:string)=>{chunks.push({at:now,text:signature(s)});if(test.listenerThrows)throw Error('observer');});
  execution.completion.then((r:any)=>{outcome=r;endedAt=now;});
  for(const step of test.steps??[]){await advance(step.at);switch(step.kind){
   case 'stdout': children[0].stdout.emit('data',Buffer.from(step.text.replaceAll('$MARKER','__JAIT_SANDBOX_PID_fixture-uuid__')));break;
   case 'stderr': children[0].stderr.emit('data',Buffer.from(step.text));break;
   case 'close':children[0].emit('close',step.code??null);break;
   case 'error':children[0].emit('error',Error(step.text));break;
   case 'stop':execution.stop().then(()=>{stops++;},(e:any)=>{error=e.message;});break;
   case 'stopDrop':void execution.stop();break;
   case 'unsubscribe':unsubscribe();break;
   case 'resolve':resolve({output:step.text,exitCode:step.code??null,timedOut:step.timedOut??false});break;
   case 'reject':reject(Error(step.text));break;
  }await flush();}
  await advance(test.finishAt??100);
 }catch(e:any){error=e.message;}
 results.push({result:result(outcome),endedAt,error,stops,launches,kills,chunks,runnerInvocations,output:execution?signature(execution.output):null,pendingTimers:timers.size});
 // Release the reference module-global admission counter without changing evidence.
 for(const child of children)child.emit('close',0);
 globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear;
}
return results;}
export async function capacity(){const module=await factory();const savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout;let next=0;const timers=new Set<number>();
 globalThis.setTimeout=((fn:any,ms:any)=>{const id=++next;timers.add(id);return {id,unref(){}};})as any;globalThis.clearTimeout=((t:any)=>{timers.delete(t.id);})as any;
 const children:any[]=[],errors:string[]=[];const spawn=()=>{const c:any=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();c.kill=()=>{};children.push(c);return c;};
 const start=()=>module.startSandboxBackgroundProcess(['fake','exec','container','bash','-lc','true'],'container',1000,false,{spawn});
 const rejected=()=>{try{start();}catch(e:any){errors.push(e.message);}};
 try{for(let i=0;i<50;i++)start();rejected();children[0].emit('error',Error('failed'));children[0].emit('close',0);start();rejected();for(const c of children)c.emit('close',0);for(let i=0;i<50;i++)start();for(const c of children)c.emit('close',0);return {errors,launches:children.length,pendingTimers:timers.size};}
 finally{globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear;}
}
