import {createHash} from 'node:crypto';
/** Real ReminderService and real migrated, in-memory SQLite. No live memory data. */
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {ReminderService} from '../../../packages/gateway/src/services/reminders.ts';
export async function dispatch(call:any){
 const out=[],Original=globalThis.Date,log=console.log,random=crypto.getRandomValues;
 console.log=(...args)=>console.error(...args);
 try{for(const test of call.cases){
  const now=test.now??'2026-10-22T00:00:00.000Z';
  globalThis.Date=class extends Original{constructor(...args:any[]){if(args.length)super(...args as [any]);else super(now);}static now(){return new Original(now).getTime();}}as any;
  const {db,sqlite}=await openDatabase(':memory:');
  try{migrateDatabase(sqlite);for(const seed of test.seed??[])sqlite.prepare(seed.sql).run(...(seed.params??[]));
   let serial=0;crypto.getRandomValues=((bytes:Uint8Array)=>{if(bytes.length!==16)return random.call(crypto,bytes);bytes.fill(0);new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(12,serial++);return bytes;})as any;
   const service=new ReminderService(db),aliases=new Map<string,string>();
   const resolve=(v:any):any=>typeof v==='string'?(Array.from(aliases).find(([,alias])=>alias===v)?.[0]??v):Array.isArray(v)?v.map(resolve):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,resolve(v)])):v;
   const normalize=(v:any):any=>typeof v==='string'?Array.from(aliases).reduce((s,[id,alias])=>s.replaceAll(id,alias),v):Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,normalize(v)])):v;
   const steps=[];
   for(const raw of test.ops){const s=resolve(raw);let result:any;
    try{switch(s.op){
     case 'create':result=service.create(s.params);break;
     case 'update':result=service.update(s.id,s.params,s.user);break;
     case 'get':result=service.getById(s.id,s.user);break;
     case 'list':result=service.list(s.options);break;
     case 'listByIds':result=service.listByIds(s.ids);break;
     case 'delete':result=service.delete(s.id,s.user);break;
     case 'retrieved':result=service.markRetrieved(s.ids,s.user);break;
     case 'export':result=service.exportMarkdown(s.options);break;
     case 'hygiene':result=service.runHygiene(s.user);break;
     case 'scan':result=service.scanOldChatsForMemory(s.user,s.limit);break;
     case 'counts':result=Object.fromEntries(service.countByProject(s.user));break;
     case 'sql':sqlite.prepare(s.sql).run(...(s.params??[]));result={sql:true};break;
     default:throw Error('unknown reminder fixture operation');
    }result=result===undefined?{undefined:true}:{value:result};}catch(e){result={error:e instanceof Error?e.message:String(e)};}
    for(const row of sqlite.prepare('SELECT id FROM reminders ORDER BY rowid').all()as any[]){if(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id)&&!aliases.has(row.id))aliases.set(row.id,'$r'+aliases.size);}
    const value=normalize({result,rows:service.list({status:'all',limit:500})});
    if(test.summary){const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)])):v;
     const digest=(rows:any[])=>({count:rows.length,sha256:createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex')});
     value.rows=digest(value.rows);if(Array.isArray(value.result.value))value.result.value=digest(value.result.value);}
    steps.push(value);
   }out.push(steps);
  }finally{sqlite.close();}
 }}finally{globalThis.Date=Original;console.log=log;crypto.getRandomValues=random;}
 return out;
}
