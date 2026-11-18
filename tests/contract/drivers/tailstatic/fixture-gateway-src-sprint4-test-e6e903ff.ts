// Translated fixture from packages/gateway/src/sprint4.test.ts; expected literals are in tail_static.rs.
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import {
  requiresConsent,
  isCommandAllowed,
  isPathAllowedByPermission,
  matchGlob,
  type ToolPermission,
} from "../../../../packages/gateway/src/security/tool-permissions.js";
import { getProfile, listProfiles, extendProfile } from "../../../../packages/gateway/src/security/tool-profiles.js";
import { TrustEngine } from "../../../../packages/gateway/src/security/trust-engine.js";
import { ConsentAwareExecutor } from "../../../../packages/gateway/src/security/consent-executor.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint4.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint4_test_ts_23_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const onReq = vi.fn();
    const onDec = vi.fn();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000, onRequest: onReq, onDecision: onDec });

    // Start the request (non-blocking)
    const promise = cm.requestConsent({
      actionId: "act-1",
      toolName: "terminal.run",
      summary: "Run ls",
      preview: { command: "ls" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });

    // Should be pending
    __jait_capture(0, (cm.pendingCount));
    __jait_capture(1, (cm.listPending()));
    __jait_capture(2, (cm.listPending("s1")));
    __jait_capture(3, (cm.listPending("other")));
    __jait_capture(4, (onReq.mock.calls));

    // Approve
    const ok = cm.approve(cm.listPending()[0]!.id);
    __jait_capture(5, (ok));

    const decision = await promise;
    __jait_capture(6, (decision.approved));
    __jait_capture(7, (decision.decidedVia));
    __jait_capture(8, (cm.pendingCount));
    __jait_capture(9, (onDec.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_57_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });

    const promise = cm.requestConsent({
      actionId: "act-2",
      toolName: "os.install",
      summary: "Install git",
      preview: { package: "git" },
      risk: "high",
      policy: testPolicy,
      sessionId: "s1",
    });

    const req = cm.listPending()[0]!;
    cm.reject(req.id, "click", "Not needed");

    const decision = await promise;
    __jait_capture(0, (decision.approved));
    __jait_capture(1, (decision.reason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_78_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cm = new ConsentManager({ defaultTimeoutMs: 50 });

    const decision = await cm.requestConsent({
      actionId: "act-3",
      toolName: "terminal.run",
      summary: "Run something",
      preview: { command: "echo hi" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
      timeoutMs: 50,
    });

    __jait_capture(0, (decision.approved));
    __jait_capture(1, (decision.decidedVia));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_96_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });

    cm.requestConsent({
      actionId: "act-4",
      toolName: "file.write",
      summary: "Write file",
      preview: { path: "/tmp/test.txt" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });

    const req = cm.listPending()[0]!;
    __jait_captureType(0, (cm.getRequest(req.id)));
    __jait_capture(1, (cm.getRequest(req.id)!.toolName));
    __jait_captureType(2, (cm.getRequest("nonexistent")));

    // Clean up
    cm.cancelAll();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_118_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });

    const p1 = cm.requestConsent({
      actionId: "act-5",
      toolName: "terminal.run",
      summary: "Run a",
      preview: {},
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });
    const p2 = cm.requestConsent({
      actionId: "act-6",
      toolName: "terminal.run",
      summary: "Run b",
      preview: {},
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });

    __jait_capture(0, (cm.pendingCount));
    cm.cancelAll("shutdown");

    const [d1, d2] = await Promise.all([p1, p2]);
    __jait_capture(1, (d1.approved));
    __jait_capture(2, (d2.approved));
    __jait_capture(3, (cm.pendingCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_149_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cm = new ConsentManager();
    __jait_capture(0, (cm.approve("nonexistent")));
    __jait_capture(1, (cm.reject("nonexistent")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_155_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cm = new ConsentManager();
    __jait_capture(0, (cm.isApproveAllEnabledForSession("s1")));
    cm.enableApproveAllForSession("s1");
    __jait_capture(1, (cm.isApproveAllEnabledForSession("s1")));
    cm.disableApproveAllForSession("s1");
    __jait_capture(2, (cm.isApproveAllEnabledForSession("s1")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_164_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const cm1 = new ConsentManager({ db });
    cm1.enableApproveAllForSession("s-db");
    __jait_capture(0, (cm1.isApproveAllEnabledForSession("s-db")));

    // New manager instance should hydrate persisted state
    const cm2 = new ConsentManager({ db });
    __jait_capture(1, (cm2.isApproveAllEnabledForSession("s-db")));

    cm2.disableApproveAllForSession("s-db");
    const cm3 = new ConsentManager({ db });
    __jait_capture(2, (cm3.isApproveAllEnabledForSession("s-db")));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_227_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(fileReadPerm, 0, new Set())));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_231_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(oncePerm, 0, new Set())));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_235_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(oncePerm, 0, new Set(["file.write"]))));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_239_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(oncePerm, 2, new Set())));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_243_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(terminalPerm, 0, new Set())));
      __jait_capture(1, (requiresConsent(terminalPerm, 2, new Set())));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_248_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(terminalPerm, 3, new Set())));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_252_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(dangerousPerm, 3, new Set())));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_256_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (requiresConsent(undefined, 3, new Set())));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_262_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isCommandAllowed("ls -la", terminalPerm).allowed));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_266_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      const result = isCommandAllowed("rm -rf *", terminalPerm);
      __jait_capture(0, (result.allowed));
      __jait_capture(1, (result.reason));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_272_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isCommandAllowed("rm -rf /", undefined).allowed));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_278_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isPathAllowedByPermission("src/index.ts", oncePerm).allowed));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_282_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isPathAllowedByPermission(".env", oncePerm).allowed));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_286_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isPathAllowedByPermission("dist/bundle.js", oncePerm).allowed));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_292_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (matchGlob("hello.ts", "*.ts")));
      __jait_capture(1, (matchGlob("hello.js", "*.ts")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_297_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (matchGlob("src/deep/file.ts", "src/**")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_301_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (matchGlob("file1.ts", "file?.ts")));
      __jait_capture(1, (matchGlob("file12.ts", "file?.ts")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_306_5": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
const terminalPerm: ToolPermission = {
    toolName: "terminal.run",
    consentLevel: "always",
    risk: "medium",
    description: "Run a shell command.",
    deniedCommands: ["rm -rf *", "format *"],
  };
const fileReadPerm: ToolPermission = {
    toolName: "file.read",
    consentLevel: "none",
    risk: "low",
    description: "Read a file.",
  };
const oncePerm: ToolPermission = {
    toolName: "file.write",
    consentLevel: "once",
    risk: "medium",
    description: "Write a file.",
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: ["*.env", "*.key"],
  };
const dangerousPerm: ToolPermission = {
    toolName: "os.install",
    consentLevel: "dangerous",
    risk: "high",
    description: "Install a package.",
  };
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (matchGlob("README.md", "readme.md")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_317_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const profiles = listProfiles();
    __jait_capture(0, (profiles));
    __jait_capture(1, (profiles));
    __jait_capture(2, (profiles));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_324_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const perms = getProfile("minimal");
    __jait_capture(0, (perms.get("file.read")?.consentLevel));
    __jait_capture(1, (perms.get("terminal.run")?.consentLevel));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_330_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const perms = getProfile("coding");
    __jait_capture(0, (perms.get("file.write")?.consentLevel));
    __jait_capture(1, (perms.get("terminal.run")?.consentLevel));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_336_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const perms = getProfile("full");
    __jait_capture(0, (perms.get("terminal.run")?.consentLevel));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_341_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const perms = extendProfile("minimal", [
      { toolName: "terminal.run", consentLevel: "once", risk: "medium", description: "Run a shell command." },
    ]);
    __jait_capture(0, (perms.get("terminal.run")?.consentLevel));
    __jait_capture(1, (perms.get("file.read")?.consentLevel)); // unchanged
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_349_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const expectedTools = [
      "file.read", "file.list", "file.stat", "file.write", "file.patch",
      "terminal.run", "terminal.stream",
      "os.query", "os.install",
      "surfaces.list", "surfaces.start", "surfaces.stop",
    ];

    for (const name of listProfiles()) {
      const perms = getProfile(name);
      for (const tool of expectedTools) {
        __jait_capture(0, (perms.has(tool)));
      }
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_371_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    __jait_capture(0, (engine.getLevel("terminal.run")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_376_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    engine.recordApproval("terminal.run");
    engine.recordApproval("terminal.run");
    const state = engine.recordApproval("terminal.run");
    __jait_capture(0, (state.currentLevel));
    __jait_capture(1, (state.approvedCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_385_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    for (let i = 0; i < 10; i++) engine.recordApproval("file.write");
    __jait_capture(0, (engine.getLevel("file.write")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_391_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    for (let i = 0; i < 25; i++) engine.recordApproval("file.write");
    __jait_capture(0, (engine.getLevel("file.write")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_397_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    for (let i = 0; i < 10; i++) engine.recordApproval("file.write");
    __jait_capture(0, (engine.getLevel("file.write")));

    engine.recordRevert("file.write");
    __jait_capture(1, (engine.getLevel("file.write")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_406_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    engine.recordRevert("terminal.run");
    __jait_capture(0, (engine.getLevel("terminal.run")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_412_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    for (let i = 0; i < 10; i++) engine.recordApproval("file.write");
    engine.reset("file.write");
    __jait_capture(0, (engine.getLevel("file.write")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_419_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    for (let i = 0; i < 3; i++) engine.recordApproval("terminal.run");
    __jait_capture(0, (engine.getLevel("terminal.run")));
    __jait_capture(1, (engine.getLevel("file.write")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_426_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const engine = new TrustEngine();
    for (let i = 0; i < 5; i++) engine.recordApproval("file.write");
    engine.recordRevert("file.write");

    const state = engine.getState("file.write");
    __jait_capture(0, (state.approvedCount));
    __jait_capture(1, (state.revertedCount));
    __jait_capture(2, (state.currentLevel)); // was 1 (from 3 approvals), revert dropped to 0
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_461_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding"); // file.read is "none"

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const result = await executor.execute("file.read", { path: "test.txt" }, {
      sessionId: "s1",
      actionId: "a1",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (cm.pendingCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_487_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    // Start execution (will block waiting for consent)
    const promise = executor.execute("terminal.run", { command: "ls" }, {
      sessionId: "s1",
      actionId: "a2",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    // Should have a pending request
    __jait_capture(0, (cm.pendingCount));

    // Approve it
    const req = cm.listPending()[0]!;
    cm.approve(req.id);

    const result = await promise;
    __jait_capture(1, (result.ok));
    __jait_capture(2, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_521_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const promise = executor.execute("terminal.run", { command: "ls" }, {
      sessionId: "s1",
      actionId: "a3",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    const req = cm.listPending()[0]!;
    cm.reject(req.id, "click", "Too risky");

    const result = await promise;
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_550_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const result = await executor.execute("terminal.run", { command: "ls" }, {
      sessionId: "s1",
      actionId: "a4",
      projectRoot: "/tmp",
      requestedBy: "test",
    }, { dryRun: true });

    __jait_capture(0, (result.ok));
    const data = result.data as Record<string, unknown>;
    __jait_capture(1, (data.dryRun));
    __jait_capture(2, (data.requiresConsent));
    __jait_capture(3, (data.toolName));
    __jait_capture(4, (cm.pendingCount)); // no actual request created
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_579_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
      profileName: "coding",
    });

    const result = await executor.execute("custom.unknown", { value: 1 }, {
      sessionId: "s1",
      actionId: "a4b",
      projectRoot: "/tmp",
      requestedBy: "test",
    }, { dryRun: true });

    __jait_capture(0, (result.ok));
    const data = result.data as {
      requiresConsent: boolean;
      risk: string;
      policy: {
        profileName: string | null;
        consentLevel: string;
        knownTool: boolean;
        source: string;
      };
    };
    __jait_capture(1, (data.requiresConsent));
    __jait_capture(2, (data.risk));
    __jait_capture(3, (data.policy.profileName));
    __jait_capture(4, (data.policy.consentLevel));
    __jait_capture(5, (data.policy.knownTool));
    __jait_capture(6, (data.policy.source));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_620_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding"); // coding denies "rm -rf *"

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const result = await executor.execute("terminal.run", { command: "rm -rf *" }, {
      sessionId: "s1",
      actionId: "a5",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_645_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    // Execute file.read 3 times (auto-execute, no consent needed)
    for (let i = 0; i < 3; i++) {
      await executor.execute("file.read", { path: "test.txt" }, {
        sessionId: "s1",
        actionId: `a${i}`,
        projectRoot: "/tmp",
        requestedBy: "test",
      });
    }

    // Trust should have increased
    __jait_capture(0, (te.getLevel("file.read")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_673_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
function makeMockToolRegistry() {
    const registry = new ToolRegistry();
    registry.register({
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ ok: true, message: "file contents", data: { content: "hello" } }),
    });
    registry.register({
      name: "terminal.run",
      description: "Run a command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async () => ({ ok: true, message: "done", data: { output: "result" } }),
    });
    return registry;
  }

try {
await (async()=>{

    const toolRegistry = makeMockToolRegistry();
    const cm = new ConsentManager({ defaultTimeoutMs: 5000 });
    const te = new TrustEngine();
    const perms = getProfile("coding"); // terminal.run would normally require consent
    cm.enableApproveAllForSession("s-approve-all");

    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager: cm,
      trustEngine: te,
      permissions: perms,
      sessionApprovals: new Set(),
    });

    const result = await executor.execute("terminal.run", { command: "echo hi" }, {
      sessionId: "s-approve-all",
      actionId: "a-approve-all",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (cm.pendingCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_731_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const res = await app.inject({ headers, method: "GET", url: "/api/consent/pending" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { requests: unknown[] };
    __jait_capture(1, (body.requests));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_738_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const res = await app.inject({ headers, method: "GET", url: "/api/consent/policy" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as {
      activeProfileName: string | null;
      toolCount: number;
      unknownToolsRequireConsent: boolean;
      permissions: Array<{ toolName: string; description: string }>;
    };
    __jait_capture(1, (body.activeProfileName));
    __jait_capture(2, (body.unknownToolsRequireConsent));
    __jait_capture(3, (body.toolCount));
    __jait_capture(4, (body.permissions));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_753_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    // Create a pending request
    consentManager.requestConsent({
      actionId: "act-1",
      toolName: "terminal.run",
      summary: "Run ls",
      preview: { command: "ls" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });

    const res = await app.inject({ headers, method: "GET", url: "/api/consent/pending" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { requests: { id: string; toolName: string }[] };
    __jait_capture(1, (body.requests));
    __jait_capture(2, (body.requests[0]!.toolName));

    // Clean up
    consentManager.cancelAll();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_775_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const promise = consentManager.requestConsent({
      actionId: "act-2",
      toolName: "file.write",
      summary: "Write file",
      preview: { path: "test.txt" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });

    const req = consentManager.listPending()[0]!;

    const res = await app.inject({ headers,
      method: "POST",
      url: `/api/consent/${req.id}/approve`,
    });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));

    const decision = await promise;
    __jait_capture(2, (decision.approved));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_799_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const promise = consentManager.requestConsent({
      actionId: "act-3",
      toolName: "os.install",
      summary: "Install pkg",
      preview: {},
      risk: "high",
      policy: testPolicy,
      sessionId: "s1",
    });

    const req = consentManager.listPending()[0]!;

    const res = await app.inject({ headers,
      method: "POST",
      url: `/api/consent/${req.id}/reject`,
      payload: { reason: "Not needed" },
    });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));

    const decision = await promise;
    __jait_capture(2, (decision.approved));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_824_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const res = await app.inject({ headers,
      method: "POST",
      url: "/api/consent/nonexistent/approve",
    });
    __jait_capture(0, (res.statusCode));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_832_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    consentManager.requestConsent({
      actionId: "act-4",
      toolName: "terminal.run",
      summary: "Run x",
      preview: {},
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });

    const res = await app.inject({ headers, method: "GET", url: "/api/consent/count" });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));

    consentManager.cancelAll();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_850_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const p1 = consentManager.requestConsent({
      actionId: "act-a1",
      toolName: "terminal.run",
      summary: "Run a1",
      preview: { command: "echo a1" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });
    const p2 = consentManager.requestConsent({
      actionId: "act-a2",
      toolName: "terminal.run",
      summary: "Run a2",
      preview: { command: "echo a2" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s1",
    });
    const p3 = consentManager.requestConsent({
      actionId: "act-b1",
      toolName: "terminal.run",
      summary: "Run b1",
      preview: { command: "echo b1" },
      risk: "medium",
      policy: testPolicy,
      sessionId: "s2",
    });

    const res = await app.inject({ headers,
      method: "POST",
      url: "/api/consent/pending/s1/approve-all",
    });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { approvedCount: number; approveAllEnabled: boolean; requestIds: string[] };
    __jait_capture(1, (body.approvedCount));
    __jait_capture(2, (body.approveAllEnabled));
    __jait_capture(3, (body.requestIds));
    __jait_capture(4, (consentManager.isApproveAllEnabledForSession("s1")));

    const [d1, d2] = await Promise.all([p1, p2]);
    __jait_capture(5, (d1.approved));
    __jait_capture(6, (d2.approved));

    // s2 request should remain pending
    __jait_capture(7, (consentManager.listPending("s2")));
    consentManager.cancelAll();
    await p3;
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_900_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const before = await app.inject({ headers,
      method: "GET",
      url: "/api/consent/pending/s3/approve-all",
    });
    __jait_capture(0, (before.statusCode));
    __jait_capture(1, ((before.json() as { approveAllEnabled: boolean }).approveAllEnabled));

    await app.inject({ headers,
      method: "POST",
      url: "/api/consent/pending/s3/approve-all",
    });

    const afterEnable = await app.inject({ headers,
      method: "GET",
      url: "/api/consent/pending/s3/approve-all",
    });
    __jait_capture(2, ((afterEnable.json() as { approveAllEnabled: boolean }).approveAllEnabled));

    const cleared = await app.inject({ headers,
      method: "DELETE",
      url: "/api/consent/pending/s3/approve-all",
    });
    __jait_capture(3, (cleared.statusCode));
    __jait_capture(4, ((cleared.json() as { approveAllEnabled: boolean }).approveAllEnabled));

    const afterClear = await app.inject({ headers,
      method: "GET",
      url: "/api/consent/pending/s3/approve-all",
    });
    __jait_capture(5, ((afterClear.json() as { approveAllEnabled: boolean }).approveAllEnabled));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_933_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    const res = await app.inject({ headers, method: "GET", url: "/api/trust/levels" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { levels: unknown[] };
    __jait_capture(1, (body.levels));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_940_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    // Record some approvals
    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");

    const res = await app.inject({ headers, method: "GET", url: "/api/trust/levels/terminal.run" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { currentLevel: number; approvedCount: number };
    __jait_capture(1, (body.currentLevel));
    __jait_capture(2, (body.approvedCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint4_test_ts_953_3": {


const testPolicy = {
  consentLevel: "always" as const,
  description: "Test policy",
  knownTool: true,
  source: "profile" as const,
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let consentManager: ConsentManager;
let trustEngine: TrustEngine;
const __jait_hook_22174 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: vi.fn(),
      hasAction: vi.fn(() => false),
      getBySession: vi.fn(() => []),
      getAll: vi.fn(() => []),
    };

    consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    trustEngine = new TrustEngine();

    app = await createServer(loadConfig(), {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      consentManager,
      trustEngine,
    });
  };
await __jait_hook_22174();
try {
await (async()=>{

    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");
    trustEngine.recordApproval("terminal.run");

    const res = await app.inject({ headers,
      method: "POST",
      url: "/api/trust/levels/terminal.run/reset",
    });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { currentLevel: number };
    __jait_capture(1, (body.currentLevel));
  
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
