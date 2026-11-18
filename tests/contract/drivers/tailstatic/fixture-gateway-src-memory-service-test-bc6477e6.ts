// Translated fixture from packages/gateway/src/memory/service.test.ts; expected literals are in tail_static.rs.
import type { MemoryBackend, MemoryEntry, MemoryScope } from "../../../../packages/gateway/src/memory/contracts.js";
import { MemoryEngine } from "../../../../packages/gateway/src/memory/service.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/memory/service.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_memory_service_test_ts_34_3": {


class InMemoryBackend implements MemoryBackend {
  entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) throw new Error(`Missing memory ${entry.id}`);
    this.entries[index] = entry;
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    return this.entries.filter((entry) => !scope || entry.scope === scope);
  }

  async forget(id: string): Promise<boolean> {
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== previous;
  }

  async forgetExpired(): Promise<number> {
    return 0;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    const first = await memory.save({
      scope: "project",
      content: "User prefers compact todo controls with icons.",
      source: { type: "chat", id: "session-1", surface: "chat" },
    });
    const second = await memory.save({
      scope: "project",
      content: "User prefers compact todo controls with icon buttons.",
      source: { type: "chat", id: "session-2", surface: "chat" },
    });

    __jait_capture(0, (second.id), (first.id));
    __jait_capture(1, (backend.entries));
    __jait_capture(2, (backend.entries[0]?.content));
    __jait_capture(3, (backend.entries[0]?.createdAt), (first.createdAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_memory_service_test_ts_55_3": {


class InMemoryBackend implements MemoryBackend {
  entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) throw new Error(`Missing memory ${entry.id}`);
    this.entries[index] = entry;
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    return this.entries.filter((entry) => !scope || entry.scope === scope);
  }

  async forget(id: string): Promise<boolean> {
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== previous;
  }

  async forgetExpired(): Promise<number> {
    return 0;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    const older = await memory.save({
      scope: "project",
      content: "Use sparse visual layouts for marketing pages.",
      source: { type: "chat", id: "old", surface: "chat" },
    });
    backend.entries[0] = {
      ...older,
      updatedAt: "2020-01-01T00:00:00.000Z",
    };

    await memory.save({
      scope: "project",
      content: "Use compact todo controls with icons and tooltips.",
      source: { type: "chat", id: "new", surface: "chat" },
    });

    const results = await memory.search("compact todo icon controls", 2, "project");

    __jait_capture(0, (results[0]?.content));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_memory_service_test_ts_80_3": {


class InMemoryBackend implements MemoryBackend {
  entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) throw new Error(`Missing memory ${entry.id}`);
    this.entries[index] = entry;
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    return this.entries.filter((entry) => !scope || entry.scope === scope);
  }

  async forget(id: string): Promise<boolean> {
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== previous;
  }

  async forgetExpired(): Promise<number> {
    return 0;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    await memory.save({
      scope: "project",
      content: "Use compact todo controls with icons and tooltips.",
      source: { type: "chat", id: "recent", surface: "chat" },
    });

    const results = await memory.search("database migration rollback", 5, "project");

    __jait_capture(0, (results));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_memory_service_test_ts_95_3": {


class InMemoryBackend implements MemoryBackend {
  entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) throw new Error(`Missing memory ${entry.id}`);
    this.entries[index] = entry;
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    return this.entries.filter((entry) => !scope || entry.scope === scope);
  }

  async forget(id: string): Promise<boolean> {
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== previous;
  }

  async forgetExpired(): Promise<number> {
    return 0;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    for (const content of [
      "The app deploys from main after CI passes.",
      "The app renders markdown reasoning in the chat surface.",
      "The app stores provider keys in the gateway config.",
      "The app uses pnpm workspaces in a monorepo.",
      "Do not commit generated files in the web dist folder.",
      "This project keeps API contracts in packages/shared.",
      "Preview sessions run in a managed Chromium browser.",
      "What the gateway serves in production is the bundled SPA.",
      "Consent prompts appear in the app before risky tool calls.",
      "Migrations are applied in order at gateway startup.",
    ]) {
      await memory.save({ scope: "project", content, source: { type: "chat", id: content, surface: "chat" } });
    }
    const unrelated = await memory.save({
      scope: "project",
      content: "The Tizen app stream skipped ahead because of a double-backslash regex bug.",
      source: { type: "chat", id: "tizen", surface: "chat" },
    });
    const relevant = await memory.save({
      scope: "project",
      content: "Ranking uses BM25 so rare terms outweigh common ones.",
      source: { type: "chat", id: "bm25", surface: "chat" },
    });

    const results = await memory.search("what does bm25 do in this app", 5, "project");

    __jait_capture(0, (results.map((entry) => entry.id)), ([relevant.id]));
    __jait_capture(1, (results.map((entry) => entry.id)), (unrelated.id));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_memory_service_test_ts_130_3": {


class InMemoryBackend implements MemoryBackend {
  entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) throw new Error(`Missing memory ${entry.id}`);
    this.entries[index] = entry;
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    return this.entries.filter((entry) => !scope || entry.scope === scope);
  }

  async forget(id: string): Promise<boolean> {
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== previous;
  }

  async forgetExpired(): Promise<number> {
    return 0;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    const strong = await memory.save({
      scope: "project",
      content: "Release checklist lives in docs/release.md.",
      source: { type: "chat", id: "strong", surface: "chat" },
    });
    backend.entries[0] = { ...strong, updatedAt: "2020-01-01T00:00:00.000Z" };

    await memory.save({
      scope: "project",
      content: "The checklist for onboarding new contributors is in the wiki.",
      source: { type: "chat", id: "recent", surface: "chat" },
    });

    const results = await memory.search("release checklist docs", 2, "project");

    __jait_capture(0, (results[0]?.id), (strong.id));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_memory_service_test_ts_152_3": {


class InMemoryBackend implements MemoryBackend {
  entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) throw new Error(`Missing memory ${entry.id}`);
    this.entries[index] = entry;
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    return this.entries.filter((entry) => !scope || entry.scope === scope);
  }

  async forget(id: string): Promise<boolean> {
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== previous;
  }

  async forgetExpired(): Promise<number> {
    return 0;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    const saved = await memory.flushPreCompaction("session-7", [
      "[user] Please continue with the current implementation.",
      "[assistant] ok",
      "[user] Remember that API contracts should live in packages/shared.",
      "[assistant] The gateway package version is the release source of truth.",
      "[user] Remember that API contracts should live in packages/shared.",
    ]);

    __jait_capture(0, (saved));
    __jait_capture(1, (backend.entries.map((entry) => entry.content)));
    __jait_capture(2, (backend.entries.every((entry) => entry.source.type === "pre_compaction")));
    __jait_capture(3, (backend.entries.every((entry) => entry.source.id === "session-7")));
  
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
