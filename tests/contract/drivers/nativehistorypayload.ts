/** Real extraction/stubbing/persistence exports; fixture SQLite, no provider execution. */
import {extractSubAgentPayloads,stripSubAgentPayloads,persistSubAgentHistories} from '../../../packages/gateway/src/lib/sub-agent-persistence.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
export async function dispatch(call:any) {
  if(call.op==='nativehistorypayload.json') {try{return {ok:true,wire:JSON.stringify(JSON.parse(call.text))};}catch{return {ok:false};}}
  if(call.op==='nativehistorypayload.pure')return {extracted:JSON.stringify(extractSubAgentPayloads(call.text)),stripped:stripSubAgentPayloads(call.text)??null};
  const log=console.log;console.log=(...args)=>console.error(...args);
  const {db,sqlite}=await openDatabase(':memory:');try{migrateDatabase(sqlite);}finally{console.log=log;}
  const RealDate=Date;let now=call.now??1740000000000;
  globalThis.Date=class extends RealDate {
    constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}static now(){return now;}
  } as DateConstructor;
  try {
    const results=[];
    for(const step of call.steps){
      if(step.now!==undefined)now=step.now;
      try {
        if(step.op==='sql')sqlite.exec(step.sql);
        else persistSubAgentHistories(db,step.session??'s',step.message??'m',step.text);
        results.push(null);
      }catch(error:any){results.push({error:true});}
    }
    let rows;
    try{rows=sqlite.query('SELECT *,hex(sub_agent_id) AS sub_id_hex,hex(performative) AS performative_hex FROM sub_agent_history ORDER BY rowid').all();}catch{rows={error:true};}
    return {results,rows};
  }finally{globalThis.Date=RealDate;sqlite.close();}
}
