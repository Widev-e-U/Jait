// Translated fixture from packages/gateway/src/lib/network-scan.test.ts; expected literals are in tail_static.rs.
import {
  buildSubnetCandidates,
  isValidIpv4,
  mergeEntries,
  normalizeIps,
  normalizeSubnetPrefix,
  parseArpTable,
} from "../../../../packages/gateway/src/lib/network-scan.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/lib/network-scan.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_12_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = [
      "? (192.168.1.1) at 00:11:22:33:44:55 [ether] on eth0",
      "? (192.168.1.2) at aa:bb:cc:dd:ee:ff [ether] on eth0",
      "? (192.168.1.3) at <incomplete> on eth0",
    ].join("\n");

    __jait_capture(0, (parseArpTable(output)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_25_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = "? (192.168.1.3) at 0:11:22:33:44:55 on en0 ifscope [ethernet]";

    __jait_capture(0, (parseArpTable(output)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_33_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = "192.168.1.4 at 00-11-22-33-44-55 [ether] on eth0";

    __jait_capture(0, (parseArpTable(output)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_41_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = [
      "? (192.168.1.10) at ff:ff:ff:ff:ff:ff [ether] on eth0",
      "? (192.168.1.11) at 00:00:00:00:00:00 [ether] on eth0",
      "? (192.168.1.12) at 01:00:5e:00:00:01 [ether] on eth0",
      "? (192.168.1.13) at 02:11:22:33:44:55 [ether] on eth0",
    ].join("\n");

    __jait_capture(0, (parseArpTable(output)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_54_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseArpTable("")));
    __jait_capture(1, (parseArpTable("no arp entries here\njust text")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_61_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeSubnetPrefix("192.168.1.0/24")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_65_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeSubnetPrefix("192.168.1.42")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_69_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeSubnetPrefix("  10.0.0  ")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_73_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (normalizeSubnetPrefix("256.1.1.0/24")));
    __jait_captureType(1, (normalizeSubnetPrefix("192.168.999.0/24")));
    __jait_captureType(2, (normalizeSubnetPrefix("999.999.999.0/24")));
    __jait_captureType(3, (normalizeSubnetPrefix("256.1.1.42")));
    __jait_captureType(4, (normalizeSubnetPrefix("256.1.1")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_81_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (normalizeSubnetPrefix("192.168.1.0/16")));
    __jait_captureType(1, (normalizeSubnetPrefix("192.168.1.0/24/24")));
    __jait_captureType(2, (normalizeSubnetPrefix("not-an-ip")));
    __jait_captureType(3, (normalizeSubnetPrefix("")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_90_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isValidIpv4("192.168.1.1")));
    __jait_capture(1, (isValidIpv4("0.0.0.0")));
    __jait_capture(2, (isValidIpv4("255.255.255.255")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_96_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isValidIpv4("192.168.1")));
    __jait_capture(1, (isValidIpv4("192.168.1.1.1")));
    __jait_capture(2, (isValidIpv4("256.1.1.1")));
    __jait_capture(3, (isValidIpv4("1.1.1.999")));
    __jait_capture(4, (isValidIpv4("192.168.1.abc")));
    __jait_capture(5, (isValidIpv4("192.168.1.1 ")));
    __jait_capture(6, (isValidIpv4("")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_108_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeIps([" 192.168.1.1 ", "192.168.1.1", "10.0.0.1", "bad", "999.1.1.1"])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_115_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeIps(undefined)));
    __jait_capture(1, (normalizeIps([])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_122_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const entries = [
      { ip: "192.168.1.1", mac: "00:11:22:33:44:55", responsive: true },
      { ip: "192.168.1.1", mac: null, responsive: false },
      { ip: "192.168.1.2", mac: null, responsive: false },
    ];

    __jait_capture(0, (mergeEntries(entries)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_135_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const entries = [
      { ip: "192.168.1.1", mac: null, responsive: true },
      { ip: "192.168.1.1", mac: "00:11:22:33:44:55", responsive: false },
    ];

    __jait_capture(0, (mergeEntries(entries)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_148_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const candidates = buildSubnetCandidates(["192.168.1"]);
    __jait_capture(0, (candidates));
    __jait_capture(1, (candidates[0]));
    __jait_capture(2, (candidates[253]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_network_scan_test_ts_155_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const candidates = buildSubnetCandidates(["10.0.0", "10.0.1"]);
    __jait_capture(0, (candidates));
    __jait_capture(1, (candidates[0]));
    __jait_capture(2, (candidates[253]));
    __jait_capture(3, (candidates[254]));
    __jait_capture(4, (candidates[507]));
  
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
