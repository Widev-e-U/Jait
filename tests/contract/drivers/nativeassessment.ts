/** Real assessment service with deterministic clock and an explicit probe port.
 * Real TCP mode is restricted to the contract-owned loopback listener port. */
import {AssessmentService,ASSESSMENT_LIMITS} from '../../../packages/gateway/src/security/assessment.ts';
import {openRawSqlite} from '../../../packages/gateway/src/db/sqlite-shim.ts';
export async function dispatch(call:any) {
  const RealDate=Date;let now=call.now;
  globalThis.Date=class extends RealDate {constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}static now(){return now;}} as DateConstructor;
  let db:any;let service:any;const calls:any[]=[];let sequence=0;
  const scopes=new Map<string,string>(),runs=new Map<string,string>(),aliases=new Map<string,string>(),signals=new Map<string,AbortController>();
  const probe=async(target:string,port:number,signal:AbortSignal)=>{
    const index=sequence++;calls.push({target,port});
    if(call.probe?.advanceAt===index)now+=call.probe.advanceMs;
    if(call.probe?.throwAt===index)throw new Error('fixture probe failure');
    if(call.probe?.block){await new Promise<void>(resolve=>{if(signal.aborted)return resolve();signal.addEventListener('abort',()=>resolve(),{once:true});});return 'error';}
    return call.probe?.states?.[index]??'open';
  };
  const make=()=>new AssessmentService(db,call.realTcp?undefined:probe as any,call.intervalMs??0,call.durationMs??60000);
  const results:any[]=[];
  const id=(step:any,key:string,map:Map<string,string>)=>map.get(step[key])??step[key]??'';
  try {
    if(call.persistent){db=await openRawSqlite(':memory:');db.exec('CREATE TABLE security_scopes(id TEXT PRIMARY KEY,operator_id TEXT,created_at TEXT,data TEXT);CREATE TABLE security_assessment_runs(id TEXT PRIMARY KEY,operator_id TEXT,started_at TEXT,data TEXT)');if(call.seed)db.exec(call.seed);}
    service=make();
    for(const step of call.steps) {
      try {
        let value:any;
        switch(step.op) {
          case 'create':{
            if(call.realTcp && (!step.input.targets.every((ip:string)=>ip==='127.0.0.1')||!step.input.ports.every((port:number)=>port===call.allowedLoopbackPort)))throw new Error('contract TCP target is outside the owned loopback listener');
            value=service.createScope(step.input,step.operator??'owner',step.projectRoot);
            scopes.set(step.alias,value.id);aliases.set(value.id,'<scope:'+step.alias+'>');break;
          }
          case 'scope':value=service.getScope(id(step,'scope',scopes),step.operator??'owner');break;
          case 'start':{
            const external=step.external?new AbortController():undefined;if(step.preAborted)external?.abort();
            value=service.start(id(step,'scope',scopes),step.operator??'owner',step.node??'gateway',external?.signal);
            runs.set(step.alias,value.id);aliases.set(value.id,'<run:'+step.alias+'>');if(external)signals.set(step.alias,external);break;
          }
          case 'run':value=service.getRun(id(step,'run',runs),step.operator??'owner');break;
          case 'cancel':service.cancel(id(step,'run',runs),step.operator??'owner');value=null;break;
          case 'externalAbort':signals.get(step.run)?.abort();value=null;break;
          case 'wait':value=await service.wait(id(step,'run',runs),step.operator??'owner');break;
          case 'history':value=service.history(step.operator??'owner');break;
          case 'clock':now=step.now;value=null;break;
          case 'sql':db.exec(step.sql);value=null;break;
          case 'restart':service=make();value=null;break;
          default:throw new Error('unsupported assessment contract step');
        }
        // Preserve a snapshot rather than a live object held by a later operation.
        results.push(structuredClone(value));
      }catch(error:any){results.push(step.normalizeError?{failed:true}:{error:error.message});}
    }
    function register(value:any):void {
      if(!value||typeof value!=='object')return;
      if(Array.isArray(value.observations)&&typeof value.id==='string')value.observations.forEach((observation:any,index:number)=>{if(typeof observation.evidenceId==='string')aliases.set(observation.evidenceId,'<evidence:'+(aliases.get(value.id)??value.id)+':'+index+'>');});
      for(const child of Object.values(value))register(child);
    }
    results.forEach(register);
    function normalize(value:any):any {
      if(typeof value==='string')return aliases.get(value)??value;
      if(Array.isArray(value))return value.map(normalize);
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>{
        if(key==='vantagePoint')return [key,'<execution-host>'];
        if(key==='engine'&&child==='node-net-tcp-connect')return [key,'<tcp-engine>'];
        if(key==='engineVersion'&&typeof child==='string'&&(child.startsWith('bun:')||/^v\d/.test(child)))return [key,'<engine-version>'];
        return [key,normalize(child)];
      }));
      return value;
    }
    return {results:normalize(results),calls:structuredClone(calls),limits:ASSESSMENT_LIMITS};
  }finally{
    for(const run of runs.values()){try{service.cancel(run,'owner');await service.wait(run,'owner');}catch{}}
    globalThis.Date=RealDate;db?.close();
  }
}
