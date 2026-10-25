/** Source-bound provider policy; all filesystem, registry, process and timer ports are scripted. */
import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';
let loaded: Promise<any> | undefined;
async function load() {
 return loaded ??= (async () => {
  let source=await Bun.file(new URL('../../../packages/gateway/src/services/provider-updates.ts',import.meta.url)).text();
  const replace=(a:string,b:string)=>{if(source.split(a).length!==2)throw Error('Provider update binding changed: '+a);source=source.replace(a,b);};
  replace('import { accessSync, constants, realpathSync } from "node:fs";', 'const accessSync=(p,m)=>globalThis.__updatesFs("access",p,m); const realpathSync=p=>globalThis.__updatesFs("realpath",p); const constants={X_OK:1};');
  replace('import { delimiter, join } from "node:path";', 'const join=(...p)=>globalThis.__updatesJoin(...p);');
  replace('(process.env.PATH ?? "").split(delimiter)', '(globalThis.__updatesPath ?? "").split(globalThis.__updatesWindows ? ";" : ":")');
  source=source.replaceAll('process.platform === "win32"','globalThis.__updatesWindows');
  source=source.replaceAll('AbortSignal.timeout(', 'globalThis.__updatesTimeout(');
  source=source.replaceAll('setInterval(', 'globalThis.__updatesInterval(').replaceAll('clearInterval(', 'globalThis.__updatesClear(');
  const code=new Bun.Transpiler({loader:'ts'}).transformSync(source);
  const file=new URL('../../../.jait/artifacts/gateway-rust/provider-updates/fixtures/'+createHash('sha256').update(code).digest('hex')+'.mjs',import.meta.url);
  await Bun.write(file,code);return import(file.href);
 })();
}
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function fail(value:any){
 if(value.error!==undefined)throw Object.assign(Error(value.error),value.stderr===undefined?{}:{stderr:value.stderr});
 if('thrown' in value)throw value.thrown;
}
function outcome(p:Promise<any>){return p.then(result=>({ok:true,result}),error=>({ok:false,error:error instanceof Error?(error.name==='TypeError'&&error.message.includes('body.version')?"Cannot read properties of null (reading 'version')":error.message):String(error)}));}
export async function dispatch(call:any){
 const module=await load(), results=[];
 for(const test of call.cases){
  const events:any[]=[], snapshots:any[]=[], pending=new Map<string,()=>void>(),requests=new Map<string,Promise<any>>();
  const timerCallbacks=new Map<number,()=>void>();let timer=0,now=test.now??0,execCount=0,fetchCount=0;
  const emit=(name:string,args:any)=>events.push({name,args});
  (globalThis as any).__updatesTimeout=(ms:number)=>({__ms:ms});
  (globalThis as any).__updatesWindows=!!test.windows;
  (globalThis as any).__updatesJoin=(...p:string[])=>(test.windows?win32:posix).join(...p);
  (globalThis as any).__updatesPath=test.path;
  (globalThis as any).__updatesFs=(op:string,p:string,mode?:number)=>{emit(op,op==='access'?[p,mode]:[p]);const result=test.files?.[p];if(result===undefined||result[op+'Error'])throw Error('missing');return result.realpath??p;};
  (globalThis as any).__updatesInterval=(callback:()=>void,ms:number)=>{const id=++timer;emit('interval',[ms,id]);timerCallbacks.set(id,callback);return {id,unref(){emit('unref',[id]);}};};
  (globalThis as any).__updatesClear=(t:any)=>{emit('cancel',[t.id]);timerCallbacks.delete(t.id);};
  const wait=async(value:any)=>{if(value.hold)await new Promise<void>(resolve=>pending.set(value.hold,resolve));fail(value);};
  const service=new module.ProviderUpdateService({intervalMs:test.interval??21600000,now:()=>new Date(now),
   resolveCommandPath:(command:string)=>{emit('resolve',[command]);if(test.resolveError)throw Error(test.resolveError);return test.resolved??null;},
   execFile:async(command:string,args:string[],options:any)=>{emit('exec',[command,args,options]);const value=test.exec?.[execCount++]??{};await wait(value);return {stdout:value.stdout??'1.0.0',stderr:value.stderr??''};},
   fetchImpl:async(url:string,init:any)=>{emit('fetch',[url,init.headers,init.signal.__ms]);const value=test.fetch?.[fetchCount++]??{};await wait(value);return {ok:(value.status??200)>=200&&(value.status??200)<300,status:value.status??200,json:async()=>{emit('json',[]);if(value.jsonError)throw Error(value.jsonError);return Object.hasOwn(value,'body')?value.body:{version:'1.0.0'};}};},
  });
  for(const step of test.steps){
   let result:any=null;
   switch(step.op){
    case 'supports':result=service.supports(step.provider);break;
    case 'native':result=module.isNativeClaudeInstall(step.path??null);break;
    case 'path':result=module.resolveCommandPath(step.command??'claude');break;
    case 'status':result=await outcome(service.getStatus(step.provider??'codex',!!step.force));break;
    case 'update':result=await outcome(service.update(step.provider??'codex'));break;
    case 'begin':requests.set(step.id,outcome(step.update?service.update(step.provider??'codex'):service.getStatus(step.provider??'codex',!!step.force)));break;
    case 'wait':result=await requests.get(step.id);break;
    case 'drop':requests.delete(step.id);break;
    case 'release':pending.get(step.id)?.();pending.delete(step.id);break;
    case 'advance':now+=step.ms;break;
    case 'start':service.start();break;
    case 'stop':service.stop();break;
    case 'tick':for(const callback of [...timerCallbacks.values()])callback();break;
   }
   await flush();snapshots.push({result,events:events.splice(0)});
  }
  service.stop();await flush();results.push(snapshots);
 }
 return results;
}
