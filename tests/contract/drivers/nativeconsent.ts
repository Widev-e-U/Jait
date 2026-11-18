/** Real ConsentManager + real SQLite; fake wall clock and timers for deterministic order. */
import {ConsentManager} from '../../../packages/gateway/src/security/consent-manager.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
export async function dispatch(call:any) {
  const log=console.log;console.log=(...args)=>console.error(...args);
  const {db,sqlite}=await openDatabase(':memory:');
  try {migrateDatabase(sqlite);} finally {console.log=log;}
  if(call.seed)sqlite.exec(call.seed);
  const RealDate=Date, realSet=globalThis.setTimeout, realClear=globalThis.clearTimeout;
  let now=call.now??1740000000000,serial=0;
  const timers=new Map<number,{fn:()=>void,due:number}>();
  globalThis.Date=class extends RealDate {
    constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}
    static now(){return now;}
  } as DateConstructor;
  (globalThis as any).setTimeout=(fn:()=>void,delay:number)=>{const id=++serial;timers.set(id,{fn,due:now+(!(delay>=1&&delay<=2147483647)?1:Math.trunc(delay))});return id;};
  (globalThis as any).clearTimeout=(id:number)=>timers.delete(id);
  const events:any[]=[],retained:any[]=[],resolved:any={},results:any[]=[];
  const aliases=new Map<string,string>();
  let service:ConsentManager;
  const make=()=>new ConsentManager({db:call.storage?db:undefined,defaultTimeoutMs:call.defaultTimeoutMs,
    onRequest(request){
      retained.push(request);events.push({kind:'request',request:structuredClone(request),pending:service.pendingCount});
      if(call.immediateApprove)service.approve(request.id);
      if(call.throwRequest)throw new Error('request observer failed');
    },
    onDecision(decision){
      events.push({kind:'decision',decision:structuredClone(decision),pending:service.pendingCount});
      if(call.throwDecision)throw new Error('decision observer failed');
    }
  });
  try {
    service=make();
    for(const step of call.steps) {
      try {
        const id=aliases.get(step.alias)??step.alias;
        switch(step.op) {
          case 'ask': {
            const before=events.length;
            const promise=service.requestConsent(step.input);
            const request=events.slice(before).find(e=>e.kind==='request')?.request;
            if(request)aliases.set(step.alias,request.id);
            promise.then(decision=>{resolved[step.alias]={ok:true,decision};},error=>{resolved[step.alias]={error:true,message:error.message};});
            results.push(null);break;
          }
          case 'approve':results.push(service.approve(id,step.via,step.reason));break;
          case 'reject':results.push(service.reject(id,step.via,step.reason));break;
          case 'get':results.push(structuredClone(service.getRequest(id)??null));break;
          case 'list':results.push(structuredClone(service.listPending(step.session)));break;
          case 'count':results.push(service.pendingCount);break;
          case 'enable':service.enableApproveAllForSession(step.session);results.push(null);break;
          case 'disable':service.disableApproveAllForSession(step.session);results.push(null);break;
          case 'enabled':results.push(service.isApproveAllEnabledForSession(step.session));break;
          case 'cancel':service.cancelAll(step.reason);results.push(null);break;
          case 'reopen':service.cancelAll('restart');service=make();results.push(null);break;
          case 'sql':sqlite.exec(step.sql);results.push(null);break;
          case 'advance': {
            now+=step.ms;
            for(const [timerId,timer] of [...timers].sort((a,b)=>a[1].due-b[1].due))if(timer.due<=now&&timers.delete(timerId))timer.fn();
            results.push(null);break;
          }
          default:throw new Error('unknown consent step');
        }
      }catch(error:any){results.push({error:true,message:error.message});}
      await new Promise<void>(resolve=>setImmediate(resolve));
    }
    const rows=(query:string)=>{try{return sqlite.query(query).all();}catch{return {error:true};}};
    return {results,events,retained:structuredClone(retained),resolved,
      rows:call.storage?rows('SELECT id,action_id,tool_name,decision,decided_at,decided_via FROM consent_log ORDER BY rowid'):null,
      approvals:call.storage?rows('SELECT session_id,approve_all,updated_at FROM consent_session_approvals ORDER BY rowid'):null};
  }finally{
    timers.clear();globalThis.Date=RealDate;globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear;sqlite.close();
  }
}
