/** Actual discovery tool/cache; scanner dependency is a closed fixture port. */
import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const KEY=Symbol.for('jait.network-tool.fixture');let loaded:Promise<any>|undefined;
async function load(){return loaded??=(async()=>{
 const path=fileURLToPath(new URL('../../../packages/gateway/src/tools/network-tools.ts',import.meta.url));
 const built=await Bun.build({entrypoints:[path],target:'bun',plugins:[{name:'owned-network-port',setup(build){
  build.onResolve({filter:/lib\/network-scan\.js$/},()=>({path:'scanner',namespace:'network-fixture'}));build.onLoad({filter:/.*/,namespace:'network-fixture'},()=>({loader:'js',contents:"export function scanNetwork(options){return globalThis[Symbol.for('jait.network-tool.fixture')].scan(options);}"}));
  build.onLoad({filter:/tools\/network-tools\.ts$/},async args=>({loader:'ts',contents:await Bun.file(args.path).text()+'\nexport function resetForFixture(){latestScan=null;_sqlite=undefined;}'}));
 }}]});if(!built.success)throw Error(built.logs.join('\n'));const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const output=new URL(`../../../.jait/artifacts/gateway-rust/network-tool-fixtures/${hash}.mjs`,import.meta.url);await Bun.write(output,code);return import(output.href);
})();}
export async function dispatch(call:any){
 const mod=await load();if(call.op==='nativenetworkscantool.metadata'){const {execute,...metadata}=mod.createNetworkScanTool();return metadata;}
 const previousLog=console.log;console.log=(...args)=>console.error(...args);
 const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');const {sqlite}=await openDatabase(':memory:');migrateDatabase(sqlite);mod.resetForFixture();if(call.persistent)mod.setNetworkScanDb(sqlite);
 const slots=new Map<string,any>(Object.entries(structuredClone(call.slots)));const held=new Map<string,any>();const events:any[]=[];const results:any[]=[];const previous=console.error;console.error=()=>events.push({op:'persistenceError'});let cursor=0;
 (globalThis as any)[KEY]={scan:async(options:any)=>{events.push({op:'scan',options:structuredClone(options)});const step=call.scans[cursor++];if(step.error)throw Error(step.error);if('thrown'in step)throw step.thrown;return slots.get(step.slot);}};
 const ref=(name:string)=>name==='cache'?mod.getLatestNetworkScan():slots.get(name)??held.get(name)?.data;
 const copy=(v:any)=>JSON.parse(JSON.stringify(v??null));
 try{for(const step of call.steps){let value:any=null;switch(step.op){
  case 'get':value=mod.getLatestNetworkScan();break;
  case 'set':mod.setLatestNetworkScan(slots.get(step.slot));break;
  case 'scan':{const result=await mod.createNetworkScanTool().execute(step.input);if(step.hold)held.set(step.hold,result);value={...result,message:Array.from({length:result.message.length},(_,i)=>result.message.charCodeAt(i))};break;}
  case 'mutate':Object.assign(ref(step.ref),step.patch);break;
  case 'same':value=ref(step.left)===ref(step.right);break;
  case 'sql':sqlite.exec(step.sql);break;
  case 'db':value=sqlite.query('SELECT ip,mac,hostname,os_version,open_ports,ssh_reachable,agent_status,providers,first_seen_at,last_seen_at,scanned_at FROM network_hosts ORDER BY ip').all();break;
  default:throw Error('unknown network fixture action');
 }results.push(copy(value));}
 return {results,events,cache:mod.getLatestNetworkScan(),held:Object.fromEntries([...held].map(([name,result])=>[name,{...result,message:Array.from({length:result.message.length},(_,i)=>result.message.charCodeAt(i))}])),consumed:cursor};
 }finally{console.log=previousLog;console.error=previous;delete(globalThis as any)[KEY];sqlite.close();}
}
