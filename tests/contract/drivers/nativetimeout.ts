import * as timeout from '../../../packages/gateway/src/lib/command-timeout.ts';
type Call={op:string;default?:string;max?:string;value?:unknown;special?:string};
export async function dispatch(call:Call):Promise<unknown> {
  if(call.op!=='nativetimeout.resolve')throw new Error('unknown native timeout operation');
  const names=['JAIT_TERMINAL_TIMEOUT_MS','JAIT_TERMINAL_TIMEOUT_MAX_MS'] as const;
  const previous=names.map(name=>process.env[name]);
  const warn=console.warn;const warnings:string[]=[];
  try {
    for(const [index,name] of names.entries()) {
      const value=index===0?call.default:call.max;
      if(value===undefined)delete process.env[name];else process.env[name]=value;
    }
    console.warn=(...args)=>{warnings.push(args.map(String).join(' '));};
    const value=call.special==='nan'?NaN:call.special==='infinity'?Infinity:call.special==='negativeInfinity'?-Infinity:call.value;
    return {default:timeout.defaultCommandTimeoutMs(),max:timeout.maxCommandTimeoutMs(),milliseconds:timeout.resolveCommandTimeoutMs(value),warnings};
  } finally {
    console.warn=warn;
    for(const [index,name] of names.entries()) {const value=previous[index];if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
}
