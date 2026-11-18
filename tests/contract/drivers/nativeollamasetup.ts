/** Host OS/metadata controlled; real URL classifier, path lookup and setup function. */
import { mock } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
const realStat = fs.stat, realAccess = fs.access;
let active: any;
const failure = (code: string) => Object.assign(new Error(code), {code});
mock.module('node:fs/promises', () => ({...fs,
  stat: async (path: string) => {
    active.calls.push(['stat',path]);
    if(active.live)return await realStat(path);
    const state = active.paths[path]?.stat ?? 'ENOENT';
    if (state === 'file' || state === 'directory') return { isFile: () => state === 'file' };
    throw failure(state);
  },
  access: async (path: string, mode: number) => {
    active.calls.push(['access',path,mode]);
    if(active.live)return await realAccess(path,mode);
    const state = active.paths[path]?.access ?? 'EACCES';
    if(state !== 'ok') throw failure(state);
  },
}));
mock.module('node:os', () => ({...os,
  hostname: () => active.host.host,
  userInfo: () => {if(active.userError) throw new Error('host user unavailable');return {username:active.host.gatewayUser,uid:active.host.uid};},
  homedir: () => active.host.homeDir,
}));
const {getOllamaUsageSetup} = await import('../../../packages/gateway/src/services/ollama-usage-setup.ts');
export async function dispatch(call: any): Promise<any> {
  if(call.op!=='nativeollamasetup.inspect') throw new Error('unknown operation');
  active={...call,calls:[],paths:call.paths??{}};
  const before=process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;
  const platform=Object.getOwnPropertyDescriptor(process,'platform')!;
  Object.defineProperty(process,'platform',{value:call.host.platform,configurable:true});
  if(call.host.configuredKeyPath==null) delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;
  else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=call.host.configuredKeyPath;
  try {return {result:await getOllamaUsageSetup(call.url),calls:active.calls};}
  finally {
    Object.defineProperty(process,'platform',platform);
    if(before===undefined)delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=before;
  }
}
