// Translated fixture from packages/gateway/src/evaluation/isolated-gateway.test.ts; expected literals are in tail_static.rs.
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runEvaluation, suiteSchema } from "../../../../packages/gateway/src/evaluation/agent-eval.js";
import { startIsolatedEvaluationGateway } from "../../../../packages/gateway/src/evaluation/isolated-gateway.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/evaluation/isolated-gateway.test.ts",import.meta.url).href;
const __jait_require=__jait_createRequire(__jait_original_url);
const __jait_original_dir=__jait_fileURLToPath(new URL('.',__jait_original_url));
const __jait_fixture_dir=__jait_fileURLToPath(new URL('../../../../.jait/artifacts/gateway-rust-readiness/tailstatic-fixtures/',import.meta.url));
const __jait_symbols=new Map<symbol,number>();
const __jait_nestedRefs=new WeakMap<object,number>();let __jait_nextNestedRef=1;
function __jait_nestedRef(value:object):number{let id=__jait_nestedRefs.get(value);if(!id){id=__jait_nextNestedRef++;__jait_nestedRefs.set(value,id)}return id;}
// Fixture transport only. Rust owns all comparison semantics.
function __jait_boxed(value: any): any {
 const type=typeof value;
 if(type==='symbol'){let id=__jait_symbols.get(value);if(!id){id=__jait_symbols.size+1;__jait_symbols.set(value,id)}return {type,value:id};}
 if(type==='function')return {type,name:value.name};
 if(type==='undefined')return {type};
 if(type==='bigint')return {type,value:String(value)};
 if(type==='number'&&!Number.isFinite(value))return {type:'nonfinite',value:String(value)};
 const prototype=type==='object'&&value!==null?(Object.getPrototypeOf(value)?.constructor?.name??null):null;
 if(value instanceof Error)value={...value,name:value.name,message:value.message,...('cause' in value?{cause:value.cause}:{})};
 return JSON.parse(JSON.stringify({type,value,prototype},function(this:any,_key:string,child:any){const original=Object.getOwnPropertyDescriptor(this,_key)?.value;if(original instanceof Date)return {__jait_type:'date',value:Number.isNaN(original.getTime())?'NaN':original.toISOString()};if(typeof child==='string'&&!child.isWellFormed())return {__jait_type:'utf16',units:Array.from({length:child.length},(_,i)=>child.charCodeAt(i))};if(typeof AbortSignal!=='undefined'&&child instanceof AbortSignal)return {__jait_type:'AbortSignal',aborted:child.aborted,ref:__jait_nestedRef(child)};if(child instanceof Map)return {__jait_type:'map',entries:[...child]};if(child instanceof Set)return {__jait_type:'set',values:[...child]};if(child instanceof RegExp)return {__jait_type:'regexp',source:child.source,flags:child.flags};if(ArrayBuffer.isView(child)&&!(child instanceof DataView))return {__jait_type:child.constructor.name,values:Array.from(child as any)};if(typeof child==='number'&&!Number.isFinite(child))return {__jait_type:'nonfinite',value:String(child)};return typeof child==='bigint'?{__jait_type:'bigint',value:String(child)}:typeof child==='undefined'?{__jait_type:'undefined'}:typeof child==='function'?{__jait_type:'function',ref:__jait_nestedRef(child)}:child;}));
}

export async function run(name: string): Promise<unknown> {
 await __jait_mkdir(__jait_fixture_dir,{recursive:true});
 const __jait_observations: any[]=[];
 const __jait_record=(row:any)=>{__jait_observations.push(row);__jait_observe(row)};
 const __jait_refs=new WeakMap<object,number>(); let __jait_nextRef=1;
 const __jait_ref=(v:any)=>{if((typeof v!=='object'||v===null)&&typeof v!=='function')return null;let n=__jait_refs.get(v);if(!n){n=__jait_nextRef++;__jait_refs.set(v,n)}return n};
 const __jait_capture=(slot:number,actual:any,...other:any[])=>{const row:any={slot,actual:__jait_boxed(actual),ref:__jait_ref(actual)};if(Array.isArray(actual)||actual instanceof Set)row.itemRefs=Array.from(actual,__jait_ref);if(other.length){row.other=__jait_boxed(other[0]);row.otherRef=__jait_ref(other[0])}__jait_record(row)};
 const __jait_captureType=(slot:number,actual:any)=>__jait_record({slot,actual:(typeof actual==='object'&&actual!==null)?{type:'object',value:{}}:__jait_boxed(actual)});
 const __jait_captureResolved=async(slot:number,p:Promise<unknown>,...other:any[])=>__jait_capture(slot,await p,...other);
 const __jait_errorRow=(slot:number,e:any,expected?:any)=>{const errorTypes=[],prototypes=[];let p=e&&typeof e==='object'?Object.getPrototypeOf(e):null;while(p){if(p.constructor?.name)errorTypes.push(p.constructor.name);prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}const identity=typeof expected==='function';if(identity&&(expected[Symbol.hasInstance]!==Function.prototype[Symbol.hasInstance]||expected.prototype===null||typeof expected.prototype!=='object'))throw new Error('unsupported exception constructor identity');return {slot,threw:true,error:String(e instanceof Error?e.message:e),errorTypes,...(identity?{prototypes,expectedPrototype:__jait_ref(expected.prototype)}:{})}};
 const __jait_thrown=(slot:number,fn:()=>unknown,...other:any[])=>{let row:any;try{fn();row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_rejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{await p;row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_captureRejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{const actual=await p;row={slot,threw:false,actual:__jait_boxed(actual)}}catch(e){row={...__jait_errorRow(slot,e,other[0]),actual:__jait_boxed(e)}}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_instance=(slot:number,actual:any,expected:any,threw?:boolean)=>{const prototypes=[];let p=actual==null?null:Object.getPrototypeOf(actual);while(p){prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}__jait_record({slot,prototypes,expectedPrototype:__jait_ref(expected.prototype),...(threw===undefined?{}:{threw})})};
 const __jait_instanceRejected=async(slot:number,p:Promise<unknown>,expected:any)=>{let actual:any,threw=false;try{actual=await p}catch(e){actual=e;threw=true}__jait_instance(slot,actual,expected,threw)};
 switch(name){
case "tailstatic_packages_gateway_src_evaluation_isolated_gateway_test_ts_19_1": {


async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No bound address");
  return "http://127.0.0.1:" + address.port;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

try {
await (async()=>{

  const requests: string[] = [];
  let modelCalls = 0;
  const llm = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk.toString();
    const body = JSON.parse(raw || "{}");
    modelCalls++;
    const judging = body.messages?.some((m: { content?: string }) => typeof m.content === "string" && m.content.includes("You are an independent evaluator"));
    const content = judging ? JSON.stringify({ outcome: "pass", process: "pass", summary: "Verified", findings: [] }) : "Verified the fixture.";
    if (!body.stream) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] })); return; }
    res.setHeader("content-type", "text/event-stream");
    res.end('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + '\n\ndata: [DONE]\n\n');
  });
  const llmUrl = await listen(llm);
  const source = createServer((req, res) => {
    requests.push(req.method + " " + req.url);
    if (req.method !== "GET" || req.url !== "/api/auth/settings") { res.statusCode = 500; res.end("No writes allowed on source gateway"); return; }
    __jait_capture(0, (req.headers.authorization));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ api_keys: { OPENAI_API_KEY: "fixture-key", OPENAI_BASE_URL: llmUrl + "/v1" }, disabled_tools: [], jait_backend: "openai", selected_model: "fixture-model", reasoning_effort: null }));
  });
  const gateway = await listen(source);
  const output = await mkdtemp(path.join(__jait_fixture_dir, "jait-eval-isolation-test-"));
  let privateState = "";
  const previousDbPath = process.env.JAIT_DB_PATH;
  const previousProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "ollama";
  const sentinel = path.join(output, "source-sentinel.db");
  await writeFile(sentinel, "source database must stay untouched");
  process.env.JAIT_DB_PATH = sentinel;
  try {
    // Boot and create a project without model calls to verify API persistence is local.
    const isolated = await startIsolatedEvaluationGateway({ gateway, token: "source-token" });
    privateState = isolated.state;
    try {
      __jait_capture(1, ((await stat(path.join(privateState, "data/jait.db"))).isFile()));
      const headers = { authorization: "Bearer " + isolated.token, "content-type": "application/json" };
      const before = await fetch(isolated.gateway + "/api/projects", { headers }).then(r => r.json());
      __jait_capture(2, (before.projects));
      const session = await fetch(isolated.gateway + "/api/sessions", { method: "POST", headers, body: JSON.stringify({ name: "Eval isolation", projectPath: output }) });
      __jait_capture(3, (session.status));
      const projects = await fetch(isolated.gateway + "/api/projects", { headers }).then(r => r.json());
      __jait_capture(4, (projects.projects));
    } finally { await isolated.stop(); }
    await __jait_captureRejected(5, (stat(privateState)));
    const tasks = suiteSchema.parse({ version: 1, tasks: [{ id: "isolation", title: "Isolation", prompt: "Read the fixture and report completion.", fixtures: { "fixture.txt": "fixture" }, checks: [{ type: "file", path: "fixture.txt", equals: "fixture" }], rubric: ["Report completion"] }] }).tasks;
    const reports = await runEvaluation(tasks, { gateway, token: "source-token", output, model: "fixture-model", judgeModel: "fixture-model", concurrency: 1, repeat: 1, timeoutSeconds: 20, maxToolCalls: 5, maxTraceBytes: 200_000 });
    __jait_capture(6, (reports[0]?.status));
    __jait_capture(7, (modelCalls));
    __jait_capture(8, (requests));
    const saved = JSON.parse(await readFile(path.join(output, "report.json"), "utf8"));
    __jait_capture(9, (saved.gateway), (gateway));
    __jait_capture(10, (saved.databaseIsolation));
    __jait_capture(11, (await readFile(sentinel, "utf8")));
    await rm(path.dirname(reports[0]!.workspace), { recursive: true, force: true });
  } finally {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
    if (previousDbPath === undefined) delete process.env.JAIT_DB_PATH;
    else process.env.JAIT_DB_PATH = previousDbPath;
    await close(source); await close(llm); await rm(output, { recursive: true, force: true }); }

})();

} finally {

}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
