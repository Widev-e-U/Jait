// Translated fixture from packages/gateway/src/services/thread-router.test.ts; expected literals are in tail_static.rs.
import { matchSkills, matchExplicitSkillInvocations } from "../../../../packages/gateway/src/services/thread-router.js"
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/thread-router.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_6_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
      { id: 'research', name: 'Deep Research', description: 'Compare options, read docs, and synthesize findings.' },
    ]

    __jait_capture(0, (matchSkills('test todo tool for me', skills)))
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_15_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills = [
      { id: 'deep-research', name: 'Deep Research', description: 'Compare options and synthesize findings.' },
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
    ]

    const matched = matchSkills('/deep-research find me the best option', skills)
    __jait_capture(0, (matched[0]))
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_25_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes.' },
    ]
    __jait_capture(0, (matchExplicitSkillInvocations('look at src/debugging/index.ts', skills)))
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_32_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills = [
      { id: 'deep-research', name: 'Deep Research', description: 'Compare options.' },
    ]
    __jait_capture(0, (matchExplicitSkillInvocations('/deep-research please', skills)))
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_40_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills = [
      { id: 'openhue', name: 'openhue', description: 'Control Philips Hue lights and scenes via the OpenHue CLI.' },
      { id: 'eightctl', name: 'eightctl', description: 'Control Eight Sleep pods status, temperature, alarms, schedules.' },
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
    ]

    __jait_capture(0, (matchSkills('implement keyboard controls for every button in my app', skills)))
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_50_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, broken failures, and unexpected behavior.' },
      { id: 'review', name: 'Code Review', description: 'Review code quality, errors, bugs, and maintainability.' },
      { id: 'security', name: 'Security Audit', description: 'Audit code for security errors, bugs, auth, and vulnerabilities.' },
      { id: 'deep-research', name: 'Deep Research', description: 'Compare options and synthesize findings.' },
    ]

    const matched = matchSkills('/deep-research review this broken security auth error for bugs', skills)
    __jait_capture(0, (matched[0]))
    __jait_capture(1, (matched))
    __jait_capture(2, (matched.slice(1).sort()))
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_64_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
      { id: 'research', name: 'Deep Research', description: 'Compare options, read docs, and synthesize findings.' },
    ]

    __jait_capture(0, (matchSkills('Use the Debugging skill to inspect this error', skills)))
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_74_1": {




try {
await (async()=>{

  const skills = [
    { id: 'bear-notes', name: 'bear-notes', description: 'Create, search, and manage Bear notes via grizzly CLI.' },
    { id: 'apple-notes', name: 'apple-notes', description: 'Create, view, edit, delete, search, move, or export Apple Notes via memo CLI on macOS.' },
    { id: 'slack', name: 'slack', description: 'Slack message tool ops: send/read/edit/delete, react, poll, pin, thread, search, presence.' },
    { id: 'gifgrep', name: 'gifgrep', description: 'Search GIF providers, download results, and extract stills.' },
  ];
  __jait_capture(0, (matchSkills('Read notes/service.txt using Jait file tools. Write result.json and verify values from the file.', skills)));
  __jait_capture(1, (matchSkills('Discover file metadata size modified date and write result.json.', skills)));
  __jait_capture(2, (matchSkills('Search source and create the result file.', skills)));
  __jait_capture(3, (matchSkills('Search Apple Notes for my meeting notes', skills)));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_86_1": {




try {
await (async()=>{

  const skills = [{ id: 'session-logs', name: 'session-logs', description: 'Search and analyze your own session logs (older/parent conversations) using jq.' }];
  __jait_capture(0, (matchSkills('Stay inside the fixture workspace. Do not inspect parent folders or other tasks. Write and run your own tests.', skills)));
  __jait_capture(1, (matchSkills('Analyze my older session logs', skills)));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_services_thread_router_test_ts_91_1": {




try {
await (async()=>{

  __jait_capture(0, (matchSkills('inspect original config', [{ id: 'pin', name: 'pin', description: 'pin pin pin' }])));

})();

} finally {

}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
