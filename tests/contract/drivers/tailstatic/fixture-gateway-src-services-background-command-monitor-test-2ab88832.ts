// Translated fixture from packages/gateway/src/services/background-command-monitor.test.ts; expected literals are in tail_static.rs.
import {
  backgroundCommandMonitor,
  extractCompletionOutput,
  type BackgroundCommandResult,
  type MonitorableSurface,
} from "../../../../packages/gateway/src/services/background-command-monitor.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/background-command-monitor.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_33_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();

    backgroundCommandMonitor.track({ sessionId: "s1", terminalId: "t1", command: "npm test", surface });
    __jait_capture(0, (surface.listenerCount));
    __jait_capture(1, (backgroundCommandMonitor.activeCount));

    surface.emit("npm test\r\n");
    surface.emit("PASS  2 passed\r\n");
    surface.emit(oscDone(0));
    await flush();

    __jait_capture(2, (results));
    __jait_capture(3, (results[0]!));
    __jait_capture(4, (results[0]!.output));
    __jait_capture(5, (results[0]!.output));
    // Listener detached and no longer tracked once complete.
    __jait_capture(6, (surface.listenerCount));
    __jait_capture(7, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_58_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();

    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "true", surface });
    surface.emit("true\r\n" + oscDone(0));
    await flush();

    __jait_capture(0, (results));
    __jait_capture(1, (results[0]!));
    __jait_capture(2, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_74_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "pytest", surface });

    surface.emit("pytest\r\n1 failed\r\n" + oscDone(1));
    await flush();

    __jait_capture(0, (results[0]!.exitCode));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_88_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();
    const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "printf hi", surface, completionToken });

    surface.emit("printf hi\r\nhi\r\n" + completionToken + ":0\r\n");
    await flush();

    __jait_capture(0, (results));
    __jait_capture(1, (results[0]!));
    __jait_capture(2, (results[0]!.output));
    __jait_capture(3, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_106_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    backgroundCommandMonitor.setCompletionHandler(() => {});
    const surface = new FakeSurface();
    const onStop = vi.fn();
    const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    backgroundCommandMonitor.track({
      sessionId: "s",
      terminalId: "t",
      command: "printf hi",
      surface,
      completionToken,
      onStop,
    });

    surface.emit(completionToken + ":0\r\n");
    await flush();
    backgroundCommandMonitor.stopForSession("s");

    __jait_capture(0, (onStop.mock.calls));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_127_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    const handler = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(handler);
    const surface = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm run dev", surface });

    surface.emit("npm run dev\r\nlistening on :3000\r\n");
    await flush();

    __jait_capture(0, (handler.mock.calls));
    __jait_capture(1, (backgroundCommandMonitor.activeCount)); // still watching
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_140_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      backgroundCommandMonitor.setCompletionHandler(handler);
      const surface = new FakeSurface();
      backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm run dev", surface, maxWatchMs: 1000 });
      __jait_capture(0, (backgroundCommandMonitor.activeCount));

      vi.advanceTimersByTime(1001);

      __jait_capture(1, (backgroundCommandMonitor.activeCount));
      __jait_capture(2, (surface.listenerCount));
      __jait_capture(3, (handler.mock.calls));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_159_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    // The shell's prompt hook emits D before the sentinel `printf` runs, and
    // the sentinel reads `$?` for the command itself — so when the two
    // disagree, the sentinel wins.
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();
    const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "pytest", surface, completionToken });

    surface.emit("pytest\r\n1 failed\r\n" + oscDone(0));
    await flush();
    // D alone does not resolve the command while a sentinel is still expected.
    __jait_capture(0, (results));

    surface.emit(completionToken + ":1\r\n");
    await flush();

    __jait_capture(1, (results));
    __jait_capture(2, (results[0]!.exitCode));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_183_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const results: BackgroundCommandResult[] = [];
      backgroundCommandMonitor.setCompletionHandler((r) => {
        results.push(r);
      });
      const surface = new FakeSurface();
      const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
      backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, completionToken });

      // A command that consumes stdin swallows the sentinel line entirely.
      surface.emit("npm test\r\ndone\r\n" + oscDone(3));
      await vi.advanceTimersByTimeAsync(500);

      __jait_capture(0, (results));
      __jait_capture(1, (results[0]!.exitCode));
      __jait_capture(2, (backgroundCommandMonitor.activeCount));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_206_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    backgroundCommandMonitor.setCompletionHandler(() => {});
    const surface = new FakeSurface();
    __jait_capture(0, (backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "x", surface })));

    // Saturate the watcher cap; further commands run unwatched and must say so
    // rather than promising a notification that will never arrive.
    for (let i = 0; i < 60; i++) {
      backgroundCommandMonitor.track({ sessionId: `s${i}`, terminalId: `t${i}`, command: "x", surface: new FakeSurface() });
    }
    __jait_capture(1, (backgroundCommandMonitor.track({ sessionId: "late", terminalId: "late", command: "x", surface: new FakeSurface() })));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_219_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    backgroundCommandMonitor.setCompletionHandler(() => {});
    const surface = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s1", terminalId: "term-busy", command: "npm test", surface });

    __jait_capture(0, (backgroundCommandMonitor.hasWatcherForTerminal("term-busy")));
    __jait_capture(1, (backgroundCommandMonitor.hasWatcherForTerminal("term-free")));

    backgroundCommandMonitor.stopForSession("s1");
    __jait_capture(2, (backgroundCommandMonitor.hasWatcherForTerminal("term-busy")));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_231_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_998 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_1060 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_998();
try {
await (async()=>{

    backgroundCommandMonitor.setCompletionHandler(() => {});
    const a = new FakeSurface();
    const b = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s1", terminalId: "t1", command: "x", surface: a });
    backgroundCommandMonitor.track({ sessionId: "s2", terminalId: "t2", command: "y", surface: b });
    __jait_capture(0, (backgroundCommandMonitor.activeCount));

    backgroundCommandMonitor.stopForSession("s1");

    __jait_capture(1, (backgroundCommandMonitor.activeCount));
    __jait_capture(2, (a.listenerCount));
    __jait_capture(3, (b.listenerCount));
  
})();

} finally {
await __jait_hook_1060();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_248_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const raw = "npm test\r\n\x1b]633;C\x07\x1b[32mPASS\x1b[0m all good\r\n\x1b]633;D;0\x07";
    const out = extractCompletionOutput(raw, "npm test");
    __jait_capture(0, (out));
    __jait_capture(1, (out));
    __jait_capture(2, (out));
    __jait_capture(3, (out));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_257_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (extractCompletionOutput("\x1b]633;D;0\x07", "ls")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_261_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const token = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    const raw =
      "sleep 1; echo hi\r\nhi\r\n"
      + `jakob@host:/tmp$ printf '\\n${token}:%s\\n' "$?"\r\n`
      + `\r\n${token}:0\r\n`
      + "jakob@host:/tmp$ ";
    __jait_capture(0, (extractCompletionOutput(raw, "sleep 1; echo hi", "/bin/bash")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_271_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const out = extractCompletionOutput(
      ". '/tmp/jait-terminal/cmd-019f.ps1'\r\none\r\ntwo\r\njakob@host:/tmp$ ",
      "echo one\nsleep 3\necho two",
      "/bin/bash",
    );
    __jait_capture(0, (out));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_299_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_11619 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_11681 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_11619();
try {
await (async()=>{

    const surface = new FakeSurface();
    backgroundCommandMonitor.setCompletionHandler(() => {});
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, executionId: "exec-1" });

    const running = backgroundCommandMonitor.inspectExecution("s", "t", "exec-1");
    __jait_capture(0, (running?.status));
    __jait_capture(1, (running?.executionId));
    __jait_captureType(2, (running?.exitCode));

    surface.emit("npm test\r\nPASS\r\n" + oscDone(0));
    await flush();

    const done = backgroundCommandMonitor.inspectExecution("s", "t", "exec-1");
    __jait_capture(3, (done?.status));
    __jait_capture(4, (done?.exitCode));
    __jait_capture(5, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_11681();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_318_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_11619 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_11681 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_11619();
try {
await (async()=>{

    const surface = new FakeSurface();
    backgroundCommandMonitor.setCompletionHandler(() => {});
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, executionId: "exec-1", onCancel: () => {} });

    const cancelled = backgroundCommandMonitor.cancelExecution("s", "t", "exec-1");
    __jait_capture(0, (cancelled?.status));
    __jait_capture(1, (cancelled?.executionId));
    __jait_capture(2, (backgroundCommandMonitor.activeCount));
    // Cancelled execution is now inspectable through history.
    __jait_capture(3, (backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status));
  
})();

} finally {
await __jait_hook_11681();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_331_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_11619 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_11681 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_11619();
try {
await (async()=>{

    __jait_captureType(0, (backgroundCommandMonitor.inspectExecution("s", "t", "nope")));
    __jait_captureType(1, (backgroundCommandMonitor.cancelExecution("s", "t", "nope")));
  
})();

} finally {
await __jait_hook_11681();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_336_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_11619 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_11681 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_11619();
try {
await (async()=>{

    backgroundCommandMonitor.setCompletionHandler(() => {});
    const startedAt = Date.now() - 1000;
    let resolve: (value: { exitCode: number | null; output: string; timedOut?: boolean }) => void = () => {};
    const promise = new Promise<{ exitCode: number | null; output: string; timedOut?: boolean }>((r) => { resolve = r; });

    __jait_capture(0, (backgroundCommandMonitor.trackExternal({
      sessionId: "s", terminalId: "t", command: "build", startedAt,
      exitPromise: promise, executionId: "exec-1", getOutput: () => "building…",
    })));
    __jait_capture(1, (backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status));

    resolve({ exitCode: 1, output: "failed" });
    await flush();

    const done = backgroundCommandMonitor.inspectExecution("s", "t", "exec-1");
    __jait_capture(2, (done?.status));
    __jait_capture(3, (done?.exitCode));
    __jait_capture(4, (done?.output));
  
})();

} finally {
await __jait_hook_11681();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_357_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_11619 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_11681 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_11619();
try {
await (async()=>{

    const notified = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notified);
    const promise = Promise.resolve({ exitCode: null, output: "", timedOut: true });
    backgroundCommandMonitor.trackExternal({
      sessionId: "s", terminalId: "t", command: "hang", startedAt: Date.now(),
      exitPromise: promise, executionId: "exec-1", shouldNotify: () => false,
    });
    await flush();
    __jait_capture(0, (backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status));
    __jait_capture(1, (notified.mock.calls));
  
})();

} finally {
await __jait_hook_11681();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_370_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_11619 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_11681 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_11619();
try {
await (async()=>{

    const surface = new ExitSurface();
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => results.push(r));
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, executionId: "exec-1" });

    surface.exit(0);
    await flush();

    __jait_capture(0, (results));
    __jait_capture(1, (results[0]!.exitCode));
    __jait_capture(2, (backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status));
  
})();

} finally {
await __jait_hook_11681();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_384_3": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_11619 = () => backgroundCommandMonitor.clearForTests();
const __jait_hook_11681 = () => backgroundCommandMonitor.clearForTests();
await __jait_hook_11619();
try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const surface = new ExitSurface();
      const notified = vi.fn();
      const onTimeout = vi.fn();
      backgroundCommandMonitor.setCompletionHandler(notified);
      backgroundCommandMonitor.track({
        sessionId: "s", terminalId: "t", command: "npm run dev", surface,
        executionId: "exec-1", maxWatchMs: 1000, onTimeout,
      });

      await vi.advanceTimersByTimeAsync(1001);

      __jait_capture(0, (onTimeout.mock.calls));
      __jait_capture(1, (backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status));
      __jait_capture(2, (notified.mock.calls));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_11681();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_409_3_each0": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_16703 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{
const completionToken = undefined;

try {
await (async()=>{

    const surface = new FakeSurface();
    const complete = vi.fn();
    const stopped = vi.fn();
    const notified = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notified);
    backgroundCommandMonitor.track({
      sessionId: "cancel-during-output", terminalId: "terminal", command: "run", surface,
      onOutput: () => backgroundCommandMonitor.stopForSession("cancel-during-output"),
      onComplete: complete, onStop: stopped, completionToken,
    });
    surface.emit("run\r\nresult\r\n" + oscDone(0));
    await Promise.resolve();
    await Promise.resolve();
    __jait_capture(0, (complete.mock.calls));
    __jait_capture(1, (notified.mock.calls));
    __jait_capture(2, (stopped.mock.calls));
    __jait_capture(3, (surface.listenerCount));
    __jait_capture(4, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_16703();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_background_command_monitor_test_ts_409_3_each1": {


class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_16703 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{
const completionToken = "__JAIT_BACKGROUND_DONE_abc-123__";

try {
await (async()=>{

    const surface = new FakeSurface();
    const complete = vi.fn();
    const stopped = vi.fn();
    const notified = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notified);
    backgroundCommandMonitor.track({
      sessionId: "cancel-during-output", terminalId: "terminal", command: "run", surface,
      onOutput: () => backgroundCommandMonitor.stopForSession("cancel-during-output"),
      onComplete: complete, onStop: stopped, completionToken,
    });
    surface.emit("run\r\nresult\r\n" + oscDone(0));
    await Promise.resolve();
    await Promise.resolve();
    __jait_capture(0, (complete.mock.calls));
    __jait_capture(1, (notified.mock.calls));
    __jait_capture(2, (stopped.mock.calls));
    __jait_capture(3, (surface.listenerCount));
    __jait_capture(4, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_16703();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
