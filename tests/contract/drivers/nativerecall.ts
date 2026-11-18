/** MemoryEngine differential fixture. Only caller-owned disposable paths are used. */
import {mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {SqliteMemoryBackend} from '../../../packages/gateway/src/memory/sqlite-backend.ts';
import {MemoryEngine} from '../../../packages/gateway/src/memory/service.ts';
export async function dispatch(call:any) {
  if(call.op!=='nativerecall.engine')throw new Error('unknown recall operation');
  const OriginalDate=Date;const log=console.log;console.log=(...args)=>console.error(...args);
  const {db,sqlite}=await openDatabase(':memory:');
  try {
    migrateDatabase(sqlite);
    const now=OriginalDate.parse(call.now);
    globalThis.Date=class extends OriginalDate {constructor(value?:any){super(value===undefined?now:value)}static override now(){return now}} as DateConstructor;
    const backend=new SqliteMemoryBackend(db);
    for(const entry of call.entries??[])await backend.save(entry);
    if(call.sql)sqlite.exec(call.sql);
    const memoryDir=call.logDir;
    if(memoryDir&&call.blockLog){mkdirSync(dirname(memoryDir),{recursive:true});writeFileSync(memoryDir,'blocked')}
    if(memoryDir&&call.curated!==undefined){mkdirSync(dirname(memoryDir),{recursive:true});writeFileSync(join(dirname(memoryDir),'MEMORY.md'),call.curated)}
    const engine=new MemoryEngine({backend,memoryDir});
    const ids=new Map<string,string>();const reverse=new Map<string,string>();let serial=0;
    const initial=new Set((call.entries??[]).map((v:any)=>v.id));
    const canonical=(id:string)=>{if(initial.has(id))return id;if(!/^[A-Za-z0-9_-]{21}$/.test(id))throw new Error('invalid generated memory id');if(!ids.has(id)){const key='memory-'+(++serial);ids.set(id,key);reverse.set(key,id)}return ids.get(id)!};
    const normalize=(value:any):any=>{
      if(Array.isArray(value))return value.map(normalize);
      if(value&&typeof value==='object'&&'createdAt'in value&&'content'in value)return {...value,id:canonical(value.id)};
      return value;
    };
    const results:any[]=[];
    for(const step of call.steps) {
      try {
        let result:any=null;
        switch(step.op) {
          case 'save':result=await engine.save(step.data);break;
          case 'search':result=await engine.search(step.query,step.limit,step.scope);break;
          case 'list':result=await engine.list(step.scope);break;
          case 'forget':result=await engine.forget(reverse.get(step.id)??step.id);break;
          case 'expire':result=await engine.forgetExpired(step.now?new Date(step.now):undefined);break;
          case 'flush':result=await engine.flushPreCompaction(step.sessionId,step.snippets);break;
          case 'sql':sqlite.exec(step.sql);break;
          default:throw new Error('unknown memory engine step');
        }
        results.push(normalize(result));
      }catch{results.push({error:true})}
    }
    let rows:any;try{rows=sqlite.query('SELECT * FROM memories ORDER BY rowid').all().map((row:any)=>({...row,id:canonical(row.id)}))}catch{rows={error:true}}
    const files:Record<string,string>={};
    if(memoryDir){
      if(existsSync(memoryDir)&&statSync(memoryDir).isDirectory())for(const name of readdirSync(memoryDir).sort())files[name]=readFileSync(join(memoryDir,name),'utf8');
      const curated=join(dirname(memoryDir),'MEMORY.md');if(existsSync(curated))files['../MEMORY.md']=readFileSync(curated,'utf8');
    }
    return {results,rows,files};
  }finally{globalThis.Date=OriginalDate;console.log=log;sqlite.close()}
}
