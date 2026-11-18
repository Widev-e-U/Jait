/** Real scheduler and SQLite; all expectations and scripts belong to Rust. */
import {SchedulerService,matchesCronMinute,isOneShotJob} from '../../../packages/gateway/src/scheduler/service.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/index.ts';
export async function dispatch(call:any) {
  if(call.op==='nativescheduler.minute')return call.cases.map((c:any)=>matchesCronMinute(c.cron,new Date(c.date),c.zone));
  // Zone names the runtime can resolve. The bundled tzdb and the system tzdb
  // can differ by a release, so the Rust side compares against this list.
  if(call.op==='nativescheduler.zones')return Intl.supportedValuesOf('timeZone');
  if(call.op!=='nativescheduler.run')throw new Error('unknown scheduler operation');
  const RealDate=globalThis.Date;
  let now=Date.parse('2026-10-01T00:00:00.000Z');
  const savedLog=console.log;
  console.log=()=>{};
  const owned=await openDatabase(':memory:');
  migrateDatabase(owned.sqlite);
  const calls:any[]=[],events:any[]=[],answers:any[]=[],known=new Map<string,string>();
  let step:any={};let preflights=0;
  (globalThis as any).Date=class extends RealDate {
    constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}
    static now(){return now;}
  };
  const scheduler=new SchedulerService({
    db:owned.db,
    executeTool:async(execution:any)=>{
      calls.push(structuredClone(execution));
      const outcome=step.outcomes?.[execution.toolName]??step;
      if(outcome.thrown)throw new Error(outcome.thrown);
      return structuredClone(outcome.result??{ok:true,message:'done'});
    },
    onExecuted:(event:any)=>{events.push(structuredClone(event));if(step.callbackError)throw new Error(step.callbackError);},
    beforeTick:async()=>{preflights++;if(step.preflightError)throw new Error(step.preflightError);},
  });
  try {
    for(step of call.steps) {
      if(step.now!==undefined)now=typeof step.now==='number'?step.now:RealDate.parse(step.now);
      const id=known.get(step.id)??step.id;
      let value:any;
      try {
        switch(step.op) {
          case 'create': {
            const job=scheduler.create(step.params);
            if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(job.id))throw new Error('invalid generated job UUIDv7');
            known.set(step.label,job.id);value=job;break;
          }
          case 'list':value=scheduler.list(step.user);break;
          case 'get':value=scheduler.get(id,step.user);break;
          case 'update':value=scheduler.update(id,step.patch,step.user);break;
          case 'remove':value=scheduler.remove(id,step.user);break;
          case 'runs':value=scheduler.listRuns(id);break;
          case 'trigger':value=await scheduler.trigger(id,step.user,new RealDate(step.runAt??now),step.trigger??'manual');break;
          case 'tick':await scheduler.tick(new RealDate(step.runAt??now));value=null;break;
          case 'purge':value=scheduler.purgeSpentOneShots(new RealDate(step.runAt??now),step.retentionMs);break;
          case 'once':value=isOneShotJob(step.input);break;
          case 'raw':owned.sqlite.query(step.sql).run(...(step.args??[]).map((v:any)=>known.get(v)??v));value=null;break;
          default:throw new Error('unknown scheduler step');
        }
        answers.push({value:value??null});
      } catch(error:any){answers.push({error:error.message??String(error)});}
    }
    // Normalize only generated job/run UUIDs. Names, timestamps, payloads and
    // identifiers supplied by the scenario are compared exactly.
    const aliases=new Map<string,string>([...known].map(([label,id])=>[id,'job:'+label]));
    const actionIds=new Set<string>();
    const collect=(value:any)=>{
      if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){
        if((k==='id'||k==='actionId')&&typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(v)&&!aliases.has(v))actionIds.add(v);
        collect(v);
      }
    };
    const output={answers,calls,events,preflights};
    collect(output);[...actionIds].forEach((id,index)=>aliases.set(id,'run:'+index));
    const normalize=(v:any):any=>typeof v==='string'?(aliases.get(v)??(v.startsWith('Job not found: ')&&aliases.has(v.slice(15))?'Job not found: '+aliases.get(v.slice(15)):v)):Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,normalize(v)])):v;
    return normalize(output);
  }finally{scheduler.stop();globalThis.Date=RealDate;console.log=savedLog;owned.sqlite.close();}
}
