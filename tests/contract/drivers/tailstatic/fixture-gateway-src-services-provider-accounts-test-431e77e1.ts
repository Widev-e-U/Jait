// Translated fixture from packages/gateway/src/services/provider-accounts.test.ts; expected literals are in tail_static.rs.
import { ProviderUsageService } from "../../../../packages/gateway/src/services/provider-usage.js";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { ProviderAccountService } from "../../../../packages/gateway/src/services/provider-accounts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/provider-accounts.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_provider_accounts_test_ts_18_3": {


const roots: string[] = [];
const __jait_hook_469 = () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-go-usage-")); roots.push(root);
    const usage = new ProviderUsageService(db);
    const service = new ProviderAccountService(db, new ProviderRegistry(), [{ id: "opencode", name: "OpenCode", description: "Test", command: process.execPath }], root, usage);
    const own = service.create("user-1", "opencode", "Own");
    const other = service.create("user-2", "opencode", "Other");
    service.connectOpenCodeGo(own.id, "user-1", "own-key");
    service.connectOpenCodeGo(other.id, "user-2", "other-key");
    const window = { status: "ok", percent: 40, resetsAt: "2026-10-09T12:00:00Z" };
    const mock = vi.fn().mockResolvedValue(Response.json({ usage: { rolling: window, weekly: window, monthly: window } }));
    vi.stubGlobal("fetch", mock);
    __jait_capture(0, (await service.refreshUsage("user-1")));
    __jait_capture(1, (mock.mock.calls));
    __jait_capture(2, (mock.mock.calls[0]?.[1].headers.Authorization));
    __jait_capture(3, (usage.listForUser([own.id])));
    __jait_capture(4, (usage.listForUser([other.id])));
    sqlite.close();
  
})();

} finally {
await __jait_hook_469();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_accounts_test_ts_37_3": {


const roots: string[] = [];
const __jait_hook_469 = () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex test provider",
      command: process.execPath,
      args: [],
    }], root);

    const personal = service.create("user-1", "codex", "Personal");
    const work = service.create("user-1", "codex", "Work");

    __jait_capture(0, (personal.id), (work.id));
    __jait_capture(1, (service.list("user-1").map((account) => account.label).sort()));
    __jait_capture(2, (registry.getForUser(personal.id, "user-1")?.providerType));
    __jait_captureType(3, (registry.getForUser(personal.id, "user-2")));

    const personalAdapter = registry.get(personal.id) as unknown as { config: { env?: Record<string, string> } };
    const workAdapter = registry.get(work.id) as unknown as { config: { env?: Record<string, string> } };
    __jait_capture(4, (personalAdapter.config.env?.CODEX_HOME), (join(root, personal.id)));
    __jait_capture(5, (workAdapter.config.env?.CODEX_HOME), (join(root, work.id)));
    __jait_capture(6, (personalAdapter.config.env?.CODEX_HOME), (workAdapter.config.env?.CODEX_HOME));
    __jait_capture(7, (existsSync(join(root, personal.id))));

    sqlite.close();
  
})();

} finally {
await __jait_hook_469();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_accounts_test_ts_69_3": {


const roots: string[] = [];
const __jait_hook_469 = () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [
      {
        id: "codex",
        name: "Codex",
        description: "Codex test provider",
        command: process.execPath,
      },
      {
        id: "claude-code",
        name: "Claude Code",
        description: "Claude Code test provider",
        command: process.execPath,
      },
      {
        id: "local-acp",
        name: "Local ACP",
        description: "ACP provider without Jait-managed login",
        command: process.execPath,
        auth: false,
      },
    ], root);

    __jait_capture(0, (service.listTypes()));

    const personal = service.create("user-1", "claude-code", "Personal");
    const work = service.create("user-1", "claude-code", "Work");
    const personalAdapter = registry.get(personal.id) as unknown as { config: { env?: Record<string, string> } };
    const workAdapter = registry.get(work.id) as unknown as { config: { env?: Record<string, string> } };

    __jait_capture(1, (personalAdapter.config.env?.HOME), (join(root, personal.id)));
    __jait_capture(2, (workAdapter.config.env?.HOME), (join(root, work.id)));
    __jait_capture(3, (personalAdapter.config.env?.CLAUDE_CONFIG_DIR), (workAdapter.config.env?.CLAUDE_CONFIG_DIR));
    __jait_capture(4, (personalAdapter.config.env?.NPM_CONFIG_CACHE), (workAdapter.config.env?.NPM_CONFIG_CACHE));
    __jait_capture(5, (personalAdapter.config.env?.ANTHROPIC_API_KEY));
    __jait_thrown(6, () => service.create("user-1", "local-acp", "Local"));

    sqlite.close();
  
})();

} finally {
await __jait_hook_469();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_accounts_test_ts_119_3": {


const roots: string[] = [];
const __jait_hook_469 = () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex test provider",
      command: process.execPath,
    }], root);

    const first = service.create("user-1", "codex", "First");
    const second = service.create("user-1", "codex", "Second");
    __jait_capture(0, (await service.delete(first.id, "user-2")));
    __jait_capture(1, (await service.delete(first.id, "user-1")));

    __jait_captureType(2, (registry.get(first.id)));
    __jait_capture(3, (existsSync(join(root, first.id))));
    __jait_captureType(4, (registry.get(second.id)));
    __jait_capture(5, (existsSync(join(root, second.id))));

    sqlite.close();
  
})();

} finally {
await __jait_hook_469();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_accounts_test_ts_145_3": {


const roots: string[] = [];
const __jait_hook_469 = () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex test provider",
      command: process.execPath,
    }], root);

    const windows = service.create("user-1", "codex", "Work", "windows-node");
    const laptop = service.create("user-1", "codex", "Work", "laptop-node");

    __jait_capture(0, (windows.nodeId));
    __jait_capture(1, (laptop.nodeId));
    __jait_capture(2, (registry.get(windows.id)?.executionNodeId));
    __jait_capture(3, (existsSync(join(root, windows.id))));

    sqlite.close();
  
})();

} finally {
await __jait_hook_469();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_accounts_test_ts_169_3": {


const roots: string[] = [];
const __jait_hook_469 = () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex test provider",
      command: process.execPath,
    }], root);

    service.create("user-1", "codex", "Work");
    __jait_thrown(0, () => service.create("user-1", "codex", "Work"));
    __jait_thrown(1, () => service.create("user-1", "claude-code", "Work"));

    sqlite.close();
  
})();

} finally {
await __jait_hook_469();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
