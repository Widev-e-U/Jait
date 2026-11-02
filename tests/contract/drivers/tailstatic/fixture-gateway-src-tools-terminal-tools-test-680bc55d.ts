// Translated fixture from packages/gateway/src/tools/terminal-tools.test.ts; expected literals are in tail_static.rs.
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { RemoteTerminalSurface } from "../../../../packages/gateway/src/surfaces/remote-terminal.js";
import {
  AGENT_TERMINAL_ENV_PWSH,
  AGENT_TERMINAL_ENV_POSIX,
  buildAgentCommand,
  buildAgentEnvAssignments,
  buildRemoteTerminalInput,
  buildTerminalExitMarkerCommand,
  buildSingleLineTerminalInput,
  collapseLongTerminalLines,
  dedupeTerminalEchoForModel,
  describeTerminalOutputFlood,
  detectPagerPrompt,
  getTerminalCommandDoneEndOffset,
  hasStrongPagerPrompt,
  isCmdShell,
  measureTerminalOutput,
  rewriteProjectPathForSandboxCommand,
  terminalOutputStatsFor,
  truncateTerminalAnsiEcho,
  truncateTerminalToolOutput,
} from "../../../../packages/gateway/src/tools/terminal-tools.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/terminal-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_27_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (truncateTerminalToolOutput("short output", 20)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_31_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = `START-${"x".repeat(100)}-END`;
    const truncated = truncateTerminalToolOutput(output, 50);

    __jait_capture(0, (truncated));
    __jait_capture(1, (truncated));
    __jait_capture(2, (truncated));
    __jait_capture(3, (truncated));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_43_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const capture = "$ grep -n foo src/a.ts\n3:foo\n7:foo\n";
    __jait_capture(0, (dedupeTerminalEchoForModel(capture, "3:foo\n7:foo\n")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_48_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (dedupeTerminalEchoForModel("same body\n", "same body\n")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_52_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const screen = "$ git log\ncommit abc\n--More--";
    __jait_capture(0, (dedupeTerminalEchoForModel(screen, "")), (screen));
    __jait_capture(1, (dedupeTerminalEchoForModel(screen, "commit abc\n")), (screen));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_60_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (collapseLongTerminalLines("a\nb\nc")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_64_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const line = `head:${"A".repeat(200_000)}:tail`;
    const collapsed = collapseLongTerminalLines(`ok\n${line}`, 1_000);

    __jait_capture(0, (collapsed.startsWith("ok\nhead:")));
    __jait_capture(1, (collapsed.trimEnd().endsWith(":tail")));
    __jait_capture(2, (collapsed));
    __jait_capture(3, (collapsed.length));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_74_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const collapsed = collapseLongTerminalLines(`ok\n${"B".repeat(200_000)}`, 500);

    __jait_capture(0, (collapsed.startsWith("ok\n")));
    __jait_capture(1, (collapsed.length));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_81_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (collapseLongTerminalLines("tiny", 2_000)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_85_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const line = `head:${"X".repeat(5_000)}:tail`;
    const output = `ok\n${line}`;

    __jait_capture(0, (collapseLongTerminalLines(output, 0)), (output));
    __jait_capture(1, (collapseLongTerminalLines(output, -1)), (output));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_93_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = "aaa\nbbb\nccc";

    __jait_capture(0, (output.length));
    __jait_capture(1, (collapseLongTerminalLines(output, 4)), (output));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_102_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ansi = `\x1b[32m${"CAAC,".repeat(400_000)}`;
    const bounded = truncateTerminalAnsiEcho(ansi);

    __jait_capture(0, (bounded.startsWith("\x1b[32m")));
    __jait_capture(1, (bounded));
    __jait_capture(2, (bounded));
    __jait_capture(3, (bounded.length));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_112_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = `${"d".repeat(5_000)}\n`.repeat(80);
    const bounded = truncateTerminalAnsiEcho(output);

    __jait_capture(0, (bounded.length));
    __jait_capture(1, (bounded));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_120_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (truncateTerminalAnsiEcho("short \x1b[31mred\x1b[0m")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_126_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (terminalOutputStatsFor("a".repeat(1_000))));
    __jait_captureType(1, (describeTerminalOutputFlood(measureTerminalOutput("normal\noutput\n"))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_131_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (terminalOutputStatsFor("a".repeat(10_000))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_139_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const note = describeTerminalOutputFlood(measureTerminalOutput("x".repeat(120_000)));

    __jait_capture(0, (note));
    __jait_capture(1, (note));
    __jait_capture(2, (note));
    __jait_capture(3, (note));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_148_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const note = describeTerminalOutputFlood(measureTerminalOutput("line\n".repeat(20_000)));

    __jait_capture(0, (note));
    __jait_capture(1, (note));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_157_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (rewriteProjectPathForSandboxCommand(
      'cd "/home/alice/project" && ls /home/alice/project/src',
      "/home/alice/project",
    )));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_164_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (rewriteProjectPathForSandboxCommand(
      'ls /home/alice/project-backup /tmp/home/alice/project-backup',
      "/home/alice/project",
    )));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_171_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (rewriteProjectPathForSandboxCommand(
      'ROOT=/home/alice/project pnpm --dir /home/alice/project build && echo /home/alice/project.tmp',
      "/home/alice/project",
    )));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_178_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (rewriteProjectPathForSandboxCommand(
      'cd "C:\\Users\\alice\\project" && type C:\\Users\\alice\\project\\README.md',
      "C:\\Users\\alice\\project",
    )));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_187_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const command = buildTerminalExitMarkerCommand("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "done");

    __jait_capture(0, (command));
    __jait_capture(1, (command));
    __jait_capture(2, (command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_195_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildTerminalExitMarkerCommand("/bin/bash", "done")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_210_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = makeSurface();
    surface.ingestOutput("command output\r\n");
    // Shells deliver the done marker bundled with the next prompt redraw:
    surface.ingestOutput(
      "\x1b]633;D;0\x07\x1b]633;A\x07\x1b]633;B\x07user@host:~$ \x1b]633;C\x07",
    );
    surface.ingestOutput("just the new prompt, no command yet\r\n");
    const outputOffset = 1;

    __jait_capture(0, (surface.getOutputOffset()));
    __jait_capture(1, (surface.getCommandDoneEndOffset()));
    __jait_capture(2, (getTerminalCommandDoneEndOffset(surface, outputOffset)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_225_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = makeSurface();
    // Previous command's done marker, pinned at chunk 1:
    surface.ingestOutput(
      "\x1b]633;D;0\x07\x1b]633;A\x07\x1b]633;B\x07user@host:~$ \x1b]633;C\x07",
    );
    surface.ingestOutput("banner redraw\r\n");
    const startOffset = surface.getOutputOffset();
    // A command that never finishes (timed out) leaves the pin stale:
    surface.ingestOutput("long running output\r\n");

    __jait_capture(0, (surface.getCommandDoneEndOffset()));
    __jait_captureType(1, (getTerminalCommandDoneEndOffset(surface, startOffset)));
    // Only stale relative to the captured start offset:
    __jait_capture(2, (getTerminalCommandDoneEndOffset(surface, 0)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_244_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = buildAgentCommand("git log --oneline", "/bin/bash");

    __jait_capture(0, (result.startsWith("export ")));
    __jait_capture(1, (result));
    __jait_capture(2, (result));
    __jait_capture(3, (result));
    __jait_capture(4, (result.endsWith("git log --oneline")));
    // Every env entry must survive the prefix.
    for (const entry of AGENT_TERMINAL_ENV_POSIX) {
      __jait_capture(5, (result), (entry));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_258_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const command = "echo one\necho two";
    const result = buildAgentCommand(command, "/bin/bash");

    __jait_capture(0, (result.startsWith("export ")));
    __jait_capture(1, (result));
    // The original command body stays untouched after the prefix line.
    __jait_capture(2, (result.endsWith(command)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_268_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = buildAgentCommand("git log", "pwsh.exe");

    __jait_capture(0, (result));
    __jait_capture(1, (result));
    __jait_capture(2, (result.endsWith("git log")));
    __jait_capture(3, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_277_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const command = "git log";
    __jait_capture(0, (buildAgentCommand(command, "cmd.exe")), (command));
    __jait_capture(1, (buildAgentCommand(command, "C:\\Windows\\system32\\cmd.EXE")), (command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_283_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const command = "git log";
    for (const shell of ["/usr/bin/zsh", "/usr/bin/fish", "/bin/sh"]) {
      const result = buildAgentCommand(command, shell);
      __jait_capture(0, (result.startsWith("export ")));
      __jait_capture(1, (result.endsWith(command)));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_292_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildAgentCommand("", "/bin/bash")));
    __jait_capture(1, (buildAgentCommand("   ", "/bin/bash")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_297_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = buildAgentCommand("gh pr list", "/bin/bash", {
      GH_TOKEN: "ghs_installation_token",
      GIT_AUTHOR_NAME: "jait-agent",
    });

    __jait_capture(0, (result));
    __jait_capture(1, (result));
    __jait_capture(2, (result));
    __jait_capture(3, (result));
    __jait_capture(4, (result.endsWith("gh pr list")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_310_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const assignments = buildAgentEnvAssignments({ GH_TOKEN: "a'b; rm -rf / ;echo 'c" }, "/bin/bash");

    // The value stays a single shell word: every quote is closed, escaped and
    // reopened, so the embedded `; rm -rf / ;echo` never runs as its own command.
    __jait_capture(0, (assignments));
    __jait_capture(1, (buildAgentCommand("echo hi", "/bin/bash", { GH_TOKEN: "a'b" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_321_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = buildAgentCommand("gh pr list", "pwsh.exe", {
      GH_TOKEN: "a'b",
    });

    __jait_capture(0, (result));
    __jait_capture(1, (result));
    __jait_capture(2, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_331_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const assignments = buildAgentEnvAssignments(
      {
        GH_TOKEN: "ok",
        "BAD NAME": "nope",
        "9LEADING": "nope",
        "INJECT;rm -rf /": "nope",
        EMPTY: "",
      },
      "/bin/bash",
    );

    __jait_capture(0, (assignments));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_346_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildAgentEnvAssignments({ GH_TOKEN: "x" }, "cmd.exe")));
    __jait_capture(1, (buildAgentEnvAssignments(null, "/bin/bash")));
    __jait_capture(2, (buildAgentEnvAssignments({}, "pwsh.exe")));
    __jait_capture(3, (buildAgentCommand("git log", "cmd.exe", { GH_TOKEN: "x" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_355_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (AGENT_TERMINAL_ENV_PWSH), (AGENT_TERMINAL_ENV_POSIX.length));
    __jait_capture(1, (AGENT_TERMINAL_ENV_PWSH[0]));
    __jait_capture(2, (AGENT_TERMINAL_ENV_PWSH));
    __jait_capture(3, (AGENT_TERMINAL_ENV_PWSH));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_362_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isCmdShell("cmd")));
    __jait_capture(1, (isCmdShell("cmd.exe")));
    __jait_capture(2, (isCmdShell("C:\\Windows\\System32\\cmd.exe")));
    __jait_capture(3, (isCmdShell("/bin/bash")));
    __jait_capture(4, (isCmdShell("pwsh")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_372_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (hasStrongPagerPrompt("some paged content\r\n(END)")));
    __jait_capture(1, (hasStrongPagerPrompt("content\n  (END)  ")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_377_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (hasStrongPagerPrompt("manual page\nPress RETURN to continue ")));
    __jait_capture(1, (hasStrongPagerPrompt("Manual page git(1) line 1\nNo next tag")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_382_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (hasStrongPagerPrompt("git log output\n:")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_386_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (hasStrongPagerPrompt("Dependencies resolved.\n\ndone")));
    __jait_capture(1, (hasStrongPagerPrompt("Building project...\nDone in 1.2s")));
    // "Dependencies resolved:" is not a lone-colon line.
    __jait_capture(2, (hasStrongPagerPrompt("step 1 ok\nDependencies resolved:")));
    // Colon only matches when it is the last line.
    __jait_capture(3, (hasStrongPagerPrompt(":\nmore output after the prompt")));
    __jait_capture(4, (hasStrongPagerPrompt("")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_398_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (detectPagerPrompt("lines of output\n(END)")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_402_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (detectPagerPrompt("vite v5.0.0 ready in 320 ms\n")));
    __jait_capture(1, (detectPagerPrompt("")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_409_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildSingleLineTerminalInput(true, "powershell.exe", "Get-Location")));
    __jait_capture(1, (buildSingleLineTerminalInput(true, "pwsh", "Get-Location")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_418_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildSingleLineTerminalInput(false, "powershell.exe", "Get-Location")));
    __jait_capture(1, (buildSingleLineTerminalInput(false, "/bin/bash", "ls -la")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_425_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildSingleLineTerminalInput(true, "/bin/bash", "ls -la")));
    __jait_capture(1, (buildSingleLineTerminalInput(true, "/bin/zsh", "ls -la")));
    __jait_capture(2, (buildSingleLineTerminalInput(true, "C:\\Windows\\System32\\cmd.exe", "dir")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_431_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const multiLine = "line one\nline two";
    __jait_capture(0, (buildSingleLineTerminalInput(true, "powershell.exe", multiLine)), (multiLine));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_440_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const script = "Write-Output 'héllo'\n" + buildTerminalExitMarkerCommand("powershell.exe", "done");
    const input = buildRemoteTerminalInput(script, "powershell.exe");
    __jait_capture(0, (input));
    __jait_capture(1, (input));
    __jait_capture(2, (input.endsWith("\r")));
    const encoded = input.match(/FromBase64String\('([^']+)'\)/)![1];
    __jait_capture(3, (Buffer.from(encoded, "base64").toString("utf8")), (script));
    __jait_capture(4, (input.startsWith(". ([scriptblock]::Create(")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_457_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{
const output = Array.from({ length: 50 }, () => "z".repeat(100)).join("\n");

try {
await (async()=>{

    __jait_capture(0, (truncateTerminalToolOutput(output, 0)));
    __jait_capture(1, (truncateTerminalToolOutput(output, -1)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_462_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{
const output = Array.from({ length: 50 }, () => "z".repeat(100)).join("\n");

try {
await (async()=>{

    __jait_capture(0, (truncateTerminalToolOutput(output, 5)));
    __jait_capture(1, (truncateTerminalAnsiEcho(output, 4)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_tools_test_ts_467_3": {


function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}
/*__jait_scope_open__*/{
const output = Array.from({ length: 50 }, () => "z".repeat(100)).join("\n");

try {
await (async()=>{

    const truncated = truncateTerminalToolOutput(output, 400);
    __jait_capture(0, (truncated.length));
    __jait_capture(1, (truncated));
    __jait_capture(2, (truncated.startsWith("zzzz")));
    __jait_capture(3, (truncated.endsWith("zzzz")));
  
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
