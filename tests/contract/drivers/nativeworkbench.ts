/** Run the actual workbench class with deterministic identity/time and an owned
 * adapter seam. SQLite and orchestration are real; no scanner/network executes. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Database} from 'bun:sqlite';
const KEY=Symbol.for('jait.native-workbench.fixture');
let modulePromise:Promise<any>|undefined;
async function load(){
 return modulePromise??=(async()=>{
  const source=fileURLToPath(new URL('../../../packages/gateway/src/security/workbench.ts',import.meta.url));
  const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'bounded-workbench-fixture',setup(build){
   build.onLoad({filter:/security\/workbench\.ts$/},async args=>({contents:(await Bun.file(args.path).text()).replace('import { createHash, randomUUID } from "node:crypto";', 'import {createHash} from "node:crypto";const randomUUID=()=>globalThis[Symbol.for("jait.native-workbench.fixture")].id();')+'\nexport {EngineUnavailable};',loader:'ts'}));
   build.onResolve({filter:/\.\/assessment\.js$/},()=>({path:'assessment',namespace:'workbench-fixture'}));
   build.onResolve({filter:/^node:crypto$/},args=>args.importer.endsWith('workbench.ts')?{path:'crypto',namespace:'workbench-fixture'}:undefined);
   build.onLoad({filter:/.*/,namespace:'workbench-fixture'},args=>({loader:'js',contents:args.path==='assessment'?`export {validateScope} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/gateway/src/security/assessment.ts',import.meta.url)))};export function getAssessmentService(){return globalThis[Symbol.for('jait.native-workbench.fixture')].assessment;}`:`export {createHash} from 'node:crypto';export function randomUUID(){return globalThis[Symbol.for('jait.native-workbench.fixture')].id();}`}));
  }}]});
  if(!built.success)throw Error(built.logs.join('\n'));
  const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const path=new URL(`../../../.jait/artifacts/gateway-rust/workbench-fixtures/${hash}.mjs`,import.meta.url);await Bun.write(path,code);return import(path.href);
 })();
}
const SCHEMA='CREATE TABLE security_check_runs(id TEXT PRIMARY KEY,operator_id TEXT,scope_id TEXT,started_at TEXT,data TEXT);CREATE TABLE security_findings(id TEXT PRIMARY KEY,operator_id TEXT,scope_id TEXT,updated_at TEXT,data TEXT);CREATE TABLE security_artifacts(id TEXT PRIMARY KEY,run_id TEXT,operator_id TEXT,sha256 TEXT,content_type TEXT,raw TEXT);';
export async function dispatch(call:any){
 const {SecurityWorkbenchService,EngineUnavailable}=await load();let now=call.now;let index=0,outputIndex=0;const events:any[]=[];const aliases=new Map<string,string>();
 const db=call.persistent?new Database(':memory:'):undefined;db?.exec(SCHEMA);
 for(const run of call.seedRuns??[])db!.query('INSERT INTO security_check_runs VALUES (?,?,?,?,?)').run(run.id,run.operatorId,run.scopeId,run.startedAt,JSON.stringify(run));
 for(const finding of call.seedFindings??[])db!.query('INSERT INTO security_findings VALUES (?,?,?,?,?)').run(finding.id,call.owner??'owner',finding.scopeId,finding.lastSeen,JSON.stringify(finding));
 if(call.seedSQL)db!.exec(call.seedSQL);
 const scopes=call.scopes;const assessment={getScope(id:string,owner:string){const scope=scopes.find((s:any)=>s.id===id&&s.operatorId===owner);if(!scope)throw Error('Scope not found');return structuredClone(scope);},history(){return {runs:[]};}};
 (globalThis as any)[KEY]={assessment,id:()=>`fixture-${index++}`};
 const RealDate=globalThis.Date;
 class ControlledDate extends RealDate{constructor(...args:any[]){if(args.length)super(...args as [any]);else super(now);}static now(){return now;}}
 globalThis.Date=ControlledDate as DateConstructor;
 const adapter=async(input:any,scope:any,signal:AbortSignal)=>{
  events.push({input:structuredClone(input),scope:structuredClone(scope),aborted:signal.aborted});const output=call.outputs[outputIndex++]??call.outputs.at(-1);
  if(output.waitForAbort)await new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true});});
  if(output.advanceMs)now+=output.advanceMs;
  if(output.error)throw Error(output.error);
  if(output.unavailable){throw new EngineUnavailable(output.unavailable);}
  const result=structuredClone(output.result);if(output.rawRepeat!==undefined)result.raw='é'.repeat(output.rawRepeat);return result;
 };
 let service=new SecurityWorkbenchService(db as any,adapter);let savedService:any;
 const refs=(value:any):any=>typeof value==='string'?(aliases.get(value)??value):Array.isArray(value)?value.map(refs):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['op','alias','findingAlias'].includes(k)?v:refs(v)])):value;
 const results=[];
 try{
  for(const original of call.steps){const step=refs(original);const owner=step.owner??'owner';let result:any;
   try{switch(step.op){
    case 'authorize':result=service.authorize(step.input,owner,step.node??'gateway');break;
    case 'startWait':{const run=service.start(step.input,owner,step.node??'gateway');result=await service.wait(run.id,owner);break;}
    case 'start':{const signal=new AbortController();if(step.aborted)signal.abort();result=service.start(step.input,owner,step.node??'gateway',signal.signal);break;}
    case 'wait':result=await service.wait(step.id,owner);break;
    case 'cancel':service.cancel(step.id,owner);result=null;break;
    case 'get':result=service.get(step.id,owner);break;
    case 'finding':result=service.finding(step.id,owner);break;
    case 'history':result=service.history(owner);break;
    case 'decide':result=service.decide(step.id,owner,step.disposition);break;
    case 'plan':result=service.plan(step.id,owner);break;
    case 'verify':result=await service.verify(step.id,owner,step.node??'gateway');break;
    case 'compare':result=service.compare(step.before,step.after,owner);break;
    case 'report':result=service.report(step.id,owner);break;
    case 'delete':service.deleteRun(step.id,owner);result=null;break;
    case 'forkService':savedService=service;service=new SecurityWorkbenchService(undefined,adapter);result=null;break;
    case 'savedCancel':savedService.cancel(step.id,owner);result=null;break;
    case 'savedWait':result=await savedService.wait(step.id,owner);break;
    case 'restart':await Promise.resolve();service=new SecurityWorkbenchService(db as any,adapter);result=null;break;
    case 'advance':now+=step.ms;result=null;break;
    case 'raw':result=db!.query('SELECT id,run_id,operator_id,sha256,content_type,raw FROM security_artifacts ORDER BY id').all();break;
    case 'sql':db!.exec(step.sql);result=null;break;
    default:throw Error('Unknown workbench fixture op');
   }
   if(original.alias&&result?.id)aliases.set(original.alias,result.id);
   if(original.findingAlias&&result?.findingIds?.[0])aliases.set(original.findingAlias,result.findingIds[0]);
   results.push({ok:true,value:result??null});
   }catch(error){results.push({ok:false,error:error instanceof Error?error.message:String(error)});}
  }
  return {results,events,outputs:outputIndex};
 }finally{globalThis.Date=RealDate;delete(globalThis as any)[KEY];db?.close();}
}
