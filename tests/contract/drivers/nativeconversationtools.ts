/** Real production tool definitions/services; Rust owns requests and assertions. */
import * as preview from '../../../packages/gateway/src/tools/list-preview.ts';
import { createSessionSearchTool } from '../../../packages/gateway/src/tools/session-search-tools.ts';
import { createChatTracesTool } from '../../../packages/gateway/src/tools/chat-traces-tools.ts';
import { SessionSearchService } from '../../../packages/gateway/src/services/session-search.ts';
import { ChatTracesService } from '../../../packages/gateway/src/services/chat-traces.ts';
import { openDatabase,migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
function units(value:string){return Array.from({length:value.length},(_,i)=>value.charCodeAt(i));}
function number(value:any){return value==='nan'?NaN:value==='infinity'?Infinity:value==='negative-infinity'?-Infinity:value;}
export async function dispatch(call:any){
  if(call.op==='nativeconversationtools.metadata')return {search:createSessionSearchTool({} as any),traces:createChatTracesTool({} as any)};
  if(call.op==='nativeconversationtools.preview')return call.steps.map((s:any)=>{
    let result:string;
    switch(s.op){
      case 'list':result=preview.formatEllipsedList(s.lines,number(s.max));break;
      case 'summary':result=preview.summarizeWithPreview(s.summary,s.lines,number(s.max));break;
      case 'memory':result=preview.memoryLine(s.id,s.text,s.kind,s.extra);break;
      default:result=preview.ellipsizeText(s.text,number(s.max));
    }
    return units(result);
  });
  const log=console.log;console.log=(...args)=>console.error(...args);
  const {sqlite}=await openDatabase(':memory:');
  try{
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
    const search=createSessionSearchTool(new SessionSearchService(sqlite));const traces=createChatTracesTool(new ChatTracesService(sqlite));
    const results=[];
    for(const step of call.steps){
      if(step.sql){sqlite.exec(step.sql);results.push(null);continue;}
      try{
        const result=await(step.op==='search'?search:traces).execute(step.input,step.context??{});
        result.message=units(result.message) as any;
        if((result.data as any)?.results){for(const r of (result.data as any).results){r.content=units(r.content);r.snippet=units(r.snippet);}}
        results.push(result);
      }catch{results.push({error:true});}
    }
    return results;
  }finally{sqlite.close();console.log=log;}
}
