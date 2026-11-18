// Translated fixture from packages/gateway/src/cli-start.test.ts; expected literals are in tail_static.rs.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/cli-start.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_cli_start_test_ts_34_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture();
    const result = f.run("--port", "8123", "--host", "127.0.0.1");
    __jait_capture(0, (result.status));
    __jait_capture(1, (await readFile(f.calls, "utf8")));
    __jait_capture(2, (await readFile(f.calls, "utf8")));
    const unit = await readFile(f.unitPath, "utf8");
    __jait_capture(3, (unit));
    __jait_capture(4, (unit));
    __jait_capture(5, (unit));
    __jait_capture(6, (unit));
    __jait_capture(7, (result.stdout));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_cli_start_test_ts_48_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture({ installed: true });
    __jait_capture(0, (f.run().status));
    __jait_capture(1, (await readFile(f.unitPath, "utf8")));
    __jait_capture(2, (await readFile(f.calls, "utf8")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_cli_start_test_ts_55_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture({ installed: true });
    const result = f.run("--port", "8123");
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.stderr));
    __jait_capture(2, (await readFile(f.calls, "utf8")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_cli_start_test_ts_63_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture({ available: false });
    const result = f.run();
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.stderr));
    __jait_capture(2, (await readFile(f.calls, "utf8")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_cli_start_test_ts_71_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture();
    await mkdir(join(f.root, ".jait"));
    await writeFile(join(f.root, ".jait/jait.pid"), String(process.pid));
    const result = f.run();
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.stderr));
    __jait_capture(2, (await readFile(f.calls, "utf8")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_cli_start_test_ts_81_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture();
    __jait_capture(0, (f.run("--background").status));
    __jait_capture(1, (f.run("--port").status));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_cli_start_test_ts_87_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture({ available: false });
    const result = f.run("--help");
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.stdout));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_cli_start_test_ts_94_3": {


const cliPath = resolve(dirname(fileURLToPath(__jait_original_url)), "../bin/jait.mjs");
async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(__jait_fixture_dir, "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}
/*__jait_source_gate__ skipIf process.platform !== "linux" */
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = await fixture({ available: false });
    const isolatedCli = join(f.root, "bin/jait.mjs");
    await writeFile(isolatedCli, await readFile(cliPath));
    await writeFile(join(f.root, "bin/safe-update.mjs"), await readFile(join(dirname(cliPath), "safe-update.mjs")));
    await writeFile(join(f.root, "package.json"), JSON.stringify({ type: "module", version: "0.0.0" }));
    await writeFile(join(f.root, "bin/compile-cache.mjs"), "export {};\n");
    await mkdir(join(f.root, "dist"));
    await writeFile(join(f.root, "dist/index.js"), 'export async function main() { console.log(`foreground port=${process.env.PORT}`); }\n');
    const result = spawnSync(process.execPath, [isolatedCli, "start", "--foreground", "--port", "8123"], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, HOME: f.root, PATH: `${join(f.root, "bin")}:/usr/bin:/bin`, JAIT_TEST_CALLS: f.calls },
    });
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.stdout));
    await __jait_captureRejected(2, (readFile(f.calls, "utf8")));
  
})();

} finally {

}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
