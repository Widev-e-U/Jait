// Translated fixture from packages/gateway/src/services/orchestration/resources.test.ts; expected literals are in tail_static.rs.
import { claimsConflict, isGlobKey, keysOverlap, normalizeResourceKey, pathIsProtected } from "../../../../packages/gateway/src/services/orchestration/resources.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/resources.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_5_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeResourceKey("./src/lib.rs/")));
    __jait_capture(1, (normalizeResourceKey("src//a")));
    __jait_capture(2, (normalizeResourceKey(".")));
    __jait_capture(3, (normalizeResourceKey("name:build-lock")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_12_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const bad of ["", "   ", "/etc/passwd", "../outside", "src/../../x", "C:/x", "a\\b", "name:bad name", "name:", 42]) {
      __jait_captureType(0, (normalizeResourceKey(bad)));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_20_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (keysOverlap("src", "src/lib.rs")));
    __jait_capture(1, (keysOverlap("src", "srcx")));
    __jait_capture(2, (keysOverlap(".", "docs/readme.md")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_26_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (keysOverlap("name:lock", "name:lock")));
    __jait_capture(1, (keysOverlap("name:lock", "name:other")));
    __jait_capture(2, (keysOverlap("name:lock", "src")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_32_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const readDocs = { reads: ["docs"], writes: [] };
    const readDocsAgain = { reads: ["docs"], writes: [] };
    const writeSrc = { reads: [], writes: ["src"] };
    const writeSrcLib = { reads: [], writes: ["src/lib.rs"] };
    const readSrc = { reads: ["src"], writes: [] };
    __jait_capture(0, (claimsConflict(readDocs, readDocsAgain)));
    __jait_capture(1, (claimsConflict(writeSrc, writeSrcLib)));
    __jait_capture(2, (claimsConflict(readSrc, writeSrcLib)));
    __jait_capture(3, (claimsConflict(readDocs, writeSrc)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_44_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guarded = { reads: [], writes: ["src"], protects: ["src/tests"] };
    const otherTests = { reads: [], writes: ["docs"], protects: ["docs/api"] };
    __jait_capture(0, (claimsConflict(guarded, otherTests)));
    __jait_capture(1, (claimsConflict(guarded, { reads: [], writes: ["src/tests"] })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_53_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const protects = ["tests", "src/auth/login.test.ts"];
    __jait_capture(0, (pathIsProtected("tests", protects)));
    __jait_capture(1, (pathIsProtected("tests/unit/a.ts", protects)));
    __jait_capture(2, (pathIsProtected("src/auth/login.test.ts", protects)));
    __jait_capture(3, (pathIsProtected("testsuite/a.ts", protects)));
    __jait_capture(4, (pathIsProtected("src/auth/login.ts", protects)));
    __jait_capture(5, (pathIsProtected("src/auth", protects)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_63_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (pathIsProtected("a.test.ts", ["**/*.test.ts"])));
    __jait_capture(1, (pathIsProtected("src/a/b.test.ts", ["**/*.test.ts"])));
    __jait_capture(2, (pathIsProtected("src/a/b.ts", ["**/*.test.ts"])));
    __jait_capture(3, (pathIsProtected("src/b.test.ts", ["src/*.test.ts"])));
    __jait_capture(4, (pathIsProtected("src/a/b.test.ts", ["src/*.test.ts"])));
    __jait_capture(5, (pathIsProtected("src/a1.ts", ["src/a?.ts"])));
    __jait_capture(6, (pathIsProtected("src/a12.ts", ["src/a?.ts"])));
    __jait_capture(7, (pathIsProtected("pkg/api/__tests__/x.ts", ["**/__tests__"])));
    __jait_capture(8, (pathIsProtected("pkg/api/tests/x.ts", ["**/__tests__"])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_75_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (pathIsProtected("src/x.test.ts/inner.txt", ["**/*.test.ts"])));
    __jait_capture(1, (pathIsProtected("src/lib", ["src/**"])));
    __jait_capture(2, (pathIsProtected("src", ["src/**"])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_81_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (pathIsProtected("any/file.txt", ["."])));
    __jait_capture(1, (pathIsProtected(".", ["."])));
    __jait_capture(2, (pathIsProtected("any/file.txt", [])));
    __jait_capture(3, (pathIsProtected("any/file.txt", undefined)));
    __jait_capture(4, (pathIsProtected("name:db", ["name:db"])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_89_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (pathIsProtected("Tests/a.ts", ["tests"])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_93_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const started = Date.now();
    __jait_capture(0, (pathIsProtected("a".repeat(200), ["*a*a*a*a*a*a*a*a*a*a*b"])));
    __jait_capture(1, (pathIsProtected(Array.from({ length: 40 }, () => "a").join("/"), ["**/**/**/**/**/**/b"])));
    __jait_capture(2, (Date.now() - started));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_resources_test_ts_102_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isGlobKey("**/*.test.ts")));
    __jait_capture(1, (isGlobKey("src/a?.ts")));
    __jait_capture(2, (isGlobKey("src/tests")));
  
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
