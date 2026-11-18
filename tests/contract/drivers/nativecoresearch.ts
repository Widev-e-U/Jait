/** Actual core search wrapper, actual limit normalizer, explicit search/FS ports. */
import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
let factory:any;
async function load(){
 if(factory)return factory;
 const source=fileURLToPath(new URL('../../../packages/gateway/src/tools/core/search.ts',import.meta.url));
 const service=fileURLToPath(new URL('../../../packages/gateway/src/services/project-search.ts',import.meta.url));
 const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'core-search-ports',setup(build){
  build.onResolve({filter:/get-fs\.js$/},()=>({path:'root',namespace:'core-search-port'}));
  build.onResolve({filter:/services\/project-search\.js$/},()=>({path:'search',namespace:'core-search-port'}));
  build.onLoad({filter:/tools\/core\/search\.ts$/},async args=>{const text=await Bun.file(args.path).text();const statement='import { stat } from "node:fs/promises";';if(!text.includes(statement))throw new Error('stat dependency import changed');return {contents:text.replace(statement,'import { stat } from "jait-core-search-stat-port";'),loader:'ts'};});
  build.onResolve({filter:/^jait-core-search-stat-port$/},()=>({path:'stat',namespace:'core-search-port'}));
  build.onLoad({filter:/.*/,namespace:'core-search-port'},args=>({contents:args.path==='root'?
   'export function resolveProjectRoot(registry,sessionId,projectRoot){return registry.fixtureRoot({sessionId,projectRoot});}':args.path==='stat'?
   'export async function stat(path){return globalThis[Symbol.for("jait.contract.core-search-stat")](path);}':
   `import {normalizeProjectSearchLimit,ProjectSearchUnavailableError,PROJECT_SEARCH_DEFAULT_RESULTS,PROJECT_SEARCH_MAX_RESULTS} from ${JSON.stringify(service)};
    export {normalizeProjectSearchLimit,ProjectSearchUnavailableError,PROJECT_SEARCH_DEFAULT_RESULTS,PROJECT_SEARCH_MAX_RESULTS};
    export async function searchProject(options,runtime){const step=await runtime.fixtureSearch(options);if(step.unavailable)throw new ProjectSearchUnavailableError(step.unavailable.reason,step.unavailable.message);if('error'in step)throw new Error(step.error);if('thrown'in step)throw step.thrown;return step.response;}`,loader:'js'}));
 }}]});
 if(!built.success)throw new Error('fixture build failed: '+built.logs.join('\n'));
 const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const artifact=new URL(`../../../.jait/artifacts/gateway-rust/core-search/fixtures/${hash}.mjs`,import.meta.url);await Bun.write(artifact,code);const m=await import(artifact.href);return factory=m.createSearchTool;
}
function thrown(e:any){return e instanceof Error?{error:e.message}:{value:e};}
export async function dispatch(call:any){const create=await load();const outputs=[];
 for(const test of call.cases){const events:any[]=[];let index=0;
  const registry={fixtureRoot(args:any){events.push({op:'resolve',args});if(test.rootError)throw new Error(test.rootError);return test.root??'/owned/project';}};
  globalThis[Symbol.for('jait.contract.core-search-stat') as any]=async(path:string)=>{events.push({op:'stat',args:{path}});if(test.statError)throw new Error(test.statError);return {isFile:()=>test.isFile??false};};
  const runtime={...test.runtime};Object.defineProperty(runtime,'fixtureSearch',{value:async(args:any)=>{events.push({op:'search',args});return test.steps?.[index++]??{response:{mode:'content',matches:[],limited:false}};}});
  const tool=create(registry,runtime);const {execute,...metadata}=tool;try{outputs.push({metadata,result:await execute(test.input,test.context??{}),events});}catch(e){outputs.push({metadata,thrown:thrown(e),events});}
 }
 return outputs;
}
