/** Actual loop class/factory/schema and SQLite; only clock and UUID are fixed. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {SessionService} from '../../../packages/gateway/src/services/sessions.ts';
import {readChatLoop} from '../../../packages/shared/src/chat-loop.ts';
import {createLoopTools} from '../../../packages/gateway/src/tools/loop-tools.ts';
const KEY=Symbol.for('jait.native-chat-loops');
let modulePromise:Promise<any>|undefined;
async function load(){
 return modulePromise??=(async()=>{
  const source=fileURLToPath(new URL('../../../packages/gateway/src/services/chat-loops.ts',import.meta.url));
  const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'loop-identities',setup(build){
   build.onLoad({filter:/services\/chat-loops\.ts$/},async args=>({loader:'ts',contents:(await Bun.file(args.path).text()).replace('import { randomUUID } from "node:crypto";','const randomUUID=()=>globalThis[Symbol.for("jait.native-chat-loops")].id();')}));
  }}]});
  if(!built.success)throw Error(built.logs.join('\n'));
  const code=await built.outputs[0].text();const path=new URL('../../../.jait/artifacts/gateway-rust/chat-loops/fixtures/'+createHash('sha256').update(code).digest('hex')+'.mjs',import.meta.url);await Bun.write(path,code);return import(path.href);
 })();
}
const text=(s:string)=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
function view(v:any):any{
 if(typeof v==='string')return text(v);
 if(Array.isArray(v))return v.map(view);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,value])=>[k,view(value)]));
 return v;
}
export async function dispatch(call:any){
 if(call.op==='nativechatloops.metadata')return createLoopTools({} as any).map(({execute,...metadata})=>metadata);
 if(call.op==='nativechatloops.read')return call.values.map((v:any)=>view(readChatLoop(v)));
 const {ChatLoopService,chatLoopInstructions}=await load();
 const {db,sqlite}=await openDatabase(':memory:');const log=console.log;console.log=(...args)=>console.error(...args);
 const RealDate=Date;let now=call.now??1792713600000,index=0;const events:any[]=[];
 (globalThis as any)[KEY]={id:()=>{const n=index++;return call.ids?.[n]??'loop-'+n;}};
 globalThis.Date=class extends RealDate{constructor(value?:any){super(value===undefined?now:value)}static now(){return now}} as DateConstructor;
 try{
  migrateDatabase(sqlite);
  for(const s of call.sessions??[{id:'chat',userId:'owner',status:'active',metadata:null}]){
   sqlite.query('INSERT INTO sessions(id,user_id,name,status,metadata,created_at,last_active_at,viewed_at) VALUES(?,?,?,?,?,?,?,?)').run(s.id,s.userId??null,s.name??'Fixture',s.status??'active',s.metadata??null,'2026-10-23T00:00:00.000Z','2026-10-23T00:00:00.000Z','2026-10-23T00:00:00.000Z');
  }
  const sessions=new SessionService(db);
  let loops=new ChatLoopService(sessions,{broadcastToUser(user:string,event:any){events.push(view({op:'broadcast',user,event}));if(call.broadcastError)throw Error(call.broadcastError);}});
  loops.onWake=(id:string)=>{events.push(view({op:'wake',id}));if(call.wakeError)throw Error(call.wakeError);};
  let tools=createLoopTools(loops);
  const results:any[]=[];
  for(const step of call.steps){
   const id=step.id??'chat',user=step.user;
   try{
    let value:any=null;
    switch(step.op){
     case 'get':value=loops.get(id,user);break;
     case 'goal':value=loops.goal(id,step.input?.goal,step.input?.criteria,user);break;
     case 'control':value=loops.control(id,step.action,user);break;
     case 'answer':value=loops.resumeAfterAnswer(id,step.requestId,user);break;
     case 'check':value=loops.check(id,step.input,user);break;
     case 'finish':value=loops.finishTurn(id,step.error,step.cancelled);break;
     case 'running':value=loops.running();break;
     case 'instructions':value=chatLoopInstructions(loops.get(id,user))??null;break;
     case 'tool':value=await tools.find(t=>t.name===step.name)!.execute(step.input??{},{sessionId:id,...step.context} as any);break;
     case 'restart':{const wake=loops.onWake;const ws=(loops as any).ws;loops=new ChatLoopService(new SessionService(db),ws);loops.onWake=wake;tools=createLoopTools(loops);value=null;break;}
     case 'sql':sqlite.exec(step.sql);break;
     case 'advance':now+=step.ms;break;
     default:throw Error('unknown loop fixture operation');
    }
    results.push({value:view(value??null)});
   }catch(error){results.push({error:error instanceof Error?error.message:String(error)});}
  }
  return {results,events,sessions:sqlite.query('SELECT id,user_id,status,metadata FROM sessions ORDER BY id').all()};
 }finally{globalThis.Date=RealDate;console.log=log;delete(globalThis as any)[KEY];sqlite.close();}
}
