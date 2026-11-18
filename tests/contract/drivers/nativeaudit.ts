import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {AuditWriter} from '../../../packages/gateway/src/services/audit.ts';
import {serializeBoundedJson,limitUtf8,limitSerializedJson} from '../../../packages/gateway/src/lib/bounded-json.ts';
function expand(value:any):any {
  if(value && typeof value==='object' && value.$repeat) return value.$repeat.text.repeat(value.$repeat.count);
  if(Array.isArray(value)) return value.map(expand);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expand(v)]));
  return value;
}
function graph(spec:any):any {
  const nodes=spec.nodes.map((n:any)=> {
    switch(n.kind) {
      case 'object':return {};
      case 'array':return [];
      case 'string':return String.fromCharCode(...n.units);
      case 'bigint':return BigInt(n.value);
      case 'undefined':return undefined;
      case 'number':return Number(n.value);
      case 'bool':return n.value;
      default:return null;
    }
  });
  spec.nodes.forEach((n:any,i:number)=>{
    if(n.kind==='object')for(const [key,id] of n.entries)Object.defineProperty(nodes[i],key,{value:nodes[id],enumerable:true,writable:true,configurable:true});
    if(n.kind==='array')nodes[i].push(...n.children.map((id:number)=>nodes[id]));
  });
  return nodes[spec.root];
}
export async function dispatch(call:any) {
  if(call.op==='nativeaudit.bounded') {
    const value=call.graph?graph(call.graph):expand(call.value);
    return serializeBoundedJson(value,call.max);
  }
  if(call.op==='nativeaudit.utf8')return limitUtf8(call.value,call.max,call.suffix);
  if(call.op==='nativeaudit.serialized')return limitSerializedJson(call.value,call.max);
  if(call.op!=='nativeaudit.run')throw new Error('unknown audit operation');
  const {db,sqlite}=await openDatabase(':memory:');
  const log=console.log;console.log=(...args)=>console.error(...args);
  try {
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
    const writer=new AuditWriter(db);const results:unknown[]=[];
    for(const step of call.steps) {
      let result:unknown;
      switch(step.op) {
        case 'write':result=writer.write(expand(step.entry));break;
        case 'has':result=writer.hasAction(step.id);break;
        case 'session':result=writer.getBySession(step.id);break;
        case 'all':result=writer.getAll();break;
        default:throw new Error('unknown audit step');
      }
      results.push(result);
    }
    return {results,rows:sqlite.query('SELECT * FROM audit_log ORDER BY timestamp').all()};
  } finally {console.log=log;sqlite.close();}
}
