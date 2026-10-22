/** Actual file factories; only getFs is replaced by an explicit host port. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
let modulePromise: Promise<any> | undefined;
async function load() {
 return modulePromise ??= (async()=>{
  const source=fileURLToPath(new URL('../../../packages/gateway/src/tools/file-tools.ts',import.meta.url));
  const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'file-tools-host-port',setup(build){
   build.onResolve({filter:/get-fs\.js$/},()=>({path:'filesystem',namespace:'file-tools-fixture'}));
   build.onLoad({filter:/.*/,namespace:'file-tools-fixture'},()=>({contents:'export async function getFs(registry,context,path){await registry.port("resolve",{path},context);return {read(path){return registry.port("read",{path},context)},write(path,content){return registry.port("write",{path,content},context)},patch(path,search,replace){return registry.port("patch",{path,search,replace},context)},list(path){return registry.port("list",{path},context)},statFile(path){return registry.port("stat",{path},context)},async readBinary(path){return Uint8Array.from(await registry.port("binary",{path},context))}};}',loader:'js'}));
  }}]});
  if(!built.success)throw new Error('fixture build failed: '+built.logs.join('\n'));
  const code=await built.outputs[0].text();
  const hash=createHash('sha256').update(code).digest('hex');
  const artifact=new URL(`../../../.jait/artifacts/gateway-rust/file-tools/fixtures/${hash}.mjs`,import.meta.url);
  await Bun.write(artifact,code); return import(artifact.href);
 })();
}
const names={read:'createFileReadTool',write:'createFileWriteTool',patch:'createFilePatchTool',list:'createFileListTool',stat:'createFileStatTool',image:'createImageViewTool'};
export async function metadata(){
 const m=await load();return Object.fromEntries(Object.entries(names).map(([kind,name])=>{const {execute,...definition}=m[name]({});return [kind,definition]}));
}
export async function dispatch(call:any){
 const m=await load();const output=[];
 for(const test of call.cases){
  const context={...test.context};const events:any[]=[];let cursor=0;
  const port=async(op:string,args:any,ctx:any)=>{
   const step=test.steps?.[cursor++]??{};events.push({op,args,sameContext:ctx===context});
   if('error'in step)throw new Error(step.error);
   if('thrown'in step)throw step.thrown;
   if(step.repeatText)return step.repeatText.unit.repeat(step.repeatText.count);
   if(step.bytes)return Array.from({length:step.bytes.count},(_,i)=>(i+step.bytes.offset)%256);
   return 'response'in step?step.response:{};
  };
  const tool=m[names[test.kind as keyof typeof names]]({port});const {execute,...definition}=tool;
  output.push({metadata:definition,result:await execute(test.input,context),events});
 }
 return output;
}
