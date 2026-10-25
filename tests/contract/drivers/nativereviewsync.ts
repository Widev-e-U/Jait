/** Actual polling policy with scripted authorized ports, fixed time and virtual intervals.
 * No repository, forge, process or execution-node effects occur in these fixtures. */
import {createHash} from 'node:crypto';
let factory: Promise<any> | undefined;
async function load() {
  return factory ??= (async () => {
    let source = await Bun.file(new URL('../../../packages/gateway/src/services/thread-review-sync.ts', import.meta.url)).text();
    const bindings = [
      ['import { existsSync } from "node:fs";', 'const existsSync=(cwd)=>globalThis.__reviewPorts.exists(cwd);'],
      ['import { GitService, cleanupWorktreeRemoteAware, parseGitRemote } from "./git.js";', `const GitService=class { getPreferredRemote(cwd,branch){return globalThis.__reviewPorts.preferred(cwd,branch);} getRemoteUrl(cwd,remote){return globalThis.__reviewPorts.url(cwd,remote);} }; const cleanupWorktreeRemoteAware=(cwd,ws,branch,options)=>globalThis.__reviewPorts.cleanup(cwd,ws,branch,options); const parseGitRemote=(url)=>globalThis.__reviewPorts.parse(url);`],
      ['import { getForge } from "./git-forge.js";', 'const getForge=(provider)=>globalThis.__reviewPorts.forge(provider);'],
      ['process.cwd()', '"/fixture"'],
    ];
    for (const [from,to] of bindings) {
      if (source.split(from).length !== 2) throw Error('Review-sync binding changed: '+from);
      source=source.replace(from,to);
    }
    const code=new Bun.Transpiler({loader:'ts'}).transformSync(source);
    const path=new URL('../../../.jait/artifacts/gateway-rust/review-sync/fixtures/'+createHash('sha256').update(code).digest('hex')+'.mjs',import.meta.url);
    await Bun.write(path,code); return import(path.href);
  })();
}
export async function dispatch(call:any) {
  const {ThreadReviewSyncService}=await load(), results=[];
  for (const test of call.cases) {
    const events:any[]=[], errors:any[]=[], rows=structuredClone(test.rows??[]), counts=new Map<string,number>();
    let release:any;const held=new Promise(r=>{release=r;});let heldOnce=false;
    const invoke=(name:string,args:any[],fallback:any)=>{
      events.push({name,args:structuredClone(args)});
      const count=(counts.get(name)??0)+1;counts.set(name,count);
      if (test.fail?.name===name && (test.fail.at??1)===count) {
        if ('thrown' in test.fail) throw test.fail.thrown;
        throw Error(test.fail.message??'fixture failure');
      }
      return Object.hasOwn(test.replies??{},name)?structuredClone(test.replies[name]):fallback;
    };
    const forge={async findExistingPr(cwd:any,remote:any,branch:any){
      const value=invoke('find',[cwd,remote,branch],test.pr??null);
      if(test.hold && !heldOnce){heldOnce=true;await held;}
      return value;
    }};
    const ws=test.noWs?undefined:{
      getFsNodes(){return invoke('nodes',[],test.nodes??[]);},
      async proxyFsOp(node:any,op:any,args:any,timeout:any){
        const query=args.args.startsWith('config --get ')?'configured':args.args==='remote'?'remotes':'remoteUrl';
        return invoke(query,[node,op,args,timeout],{stdout:query==='configured'?'origin':query==='remotes'?'origin\n':test.remoteUrl??'https://github.com/org/repo.git'});
      },
      broadcastAll(event:any){invoke('broadcast',[event],null);},
    };
    const port={
      exists(cwd:any){return invoke('exists',[cwd],test.local!==false);},
      preferred(cwd:any,branch:any){return Promise.resolve(invoke('preferred',[cwd,branch],'origin'));},
      url(cwd:any,remote:any){return Promise.resolve(invoke('url',[cwd,remote],test.remoteUrl??'https://github.com/org/repo.git'));},
      parse(url:any){return invoke('parse',[url],{provider:'github',owner:'org',repo:'repo'});},
      forge(provider:any){const value=invoke('forge',[provider],true);return value?forge:null;},
      async cleanup(cwd:any,hasWs:any,branch:any,options:any){invoke('cleanup',[cwd,!!hasWs,branch,options],null);return test.cleanupPending?new Promise(()=>{}):Promise.reject(Error('ignored cleanup rejection'));},
    };
    (globalThis as any).__reviewPorts=port;
    const threads={
      list(status:any,limit:any){return invoke('list',[status??null,limit],structuredClone(rows));},
      update(id:any,patch:any){
        const row=rows.find((r:any)=>r.id===id);const result=invoke('update',[id,patch],row?{...row,...patch}:null);
        if(result && row)Object.assign(row,result);return result;
      },
      addActivity(id:any,kind:any,summary:any,metadata:any){return invoke('activity',[id,kind,summary,metadata],{id:'activity'});},
    };
    const savedDate=globalThis.Date,savedSet=globalThis.setInterval,savedClear=globalThis.clearInterval;
    let callback:any,timer=0;const timers=new Set<any>();
    globalThis.Date=class extends savedDate {constructor(...args:any[]){super(...(args.length?args:[1000]) as [any]);}} as any;
    globalThis.setInterval=((fn:any,interval:any)=>{callback=fn;const id=++timer;events.push({name:'schedule',args:[interval,id]});const token={id,unref(){events.push({name:'unref',args:[id]});}};timers.add(token);return token;}) as any;
    globalThis.clearInterval=((token:any)=>{events.push({name:'cancel',args:[token.id]});timers.delete(token);}) as any;
    try {
      const service=new ThreadReviewSyncService({threadService:threads,ws,log:{error(message:any){invoke('log',[message],null);}},...(test.defaultResolver?{}:{resolveForge:(url:any)=>invoke('resolve',[url],true)?forge:null})} as any);
      const run=async()=>{try{await service.tick();errors.push(null);}catch(e:any){errors.push(e instanceof Error?{error:e.message}:{thrown:e});}};
      if(test.lifecycle){service.start(test.interval);service.start(99);service.stop();service.stop();service.start();await run();service.stop();}
      else if(test.hold){const first=run();for(let i=0;i<12;i++)await Promise.resolve();await run();release();await first;}
      else for(let i=0;i<(test.ticks??1);i++)await run();
      await Promise.resolve();results.push({events,errors,rows,timers:timers.size});
    } finally {globalThis.Date=savedDate;globalThis.setInterval=savedSet;globalThis.clearInterval=savedClear;delete (globalThis as any).__reviewPorts;}
  }
  return results;
}
