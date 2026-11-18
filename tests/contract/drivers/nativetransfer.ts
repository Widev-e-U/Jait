/** Real execFile calls into disposable local ssh/scp peers; no network connections. */
import { execFile as originalExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, chmod, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { mock } from 'bun:test';

const execute = promisify(originalExecFile);
let calls: any[] = [];
function tappedExecFile() { throw new Error('callback entry unused'); }
Object.defineProperty(tappedExecFile, promisify.custom, { value: (program: string, args: string[], options: any) => {
  calls.push({ program, args, timeoutMs: options.timeout, maxBuffer: options.maxBuffer });
  return execute(program, args, options);
} });
mock.module('node:child_process', () => ({ execFile: tappedExecFile }));
const { transferProjectWithScp } = await import('../../../packages/gateway/src/services/project-transfer.ts');
const root = resolve(import.meta.dirname, '../../..');

export async function dispatch(call: any): Promise<any> {
  if (call.op !== 'nativetransfer.run') throw new Error('unknown transfer operation');
  const base = join(root, '.jait/artifacts/gateway-rust/project-transfer');
  await mkdir(base, { recursive: true });
  const work = await mkdtemp(join(base, 'peer-'));
  const bin = join(work, 'bin'); await mkdir(bin);
  const plan = join(work, 'plan.json'), log = join(work, 'calls.jsonl');
  await writeFile(plan, JSON.stringify(call.plan ?? {})); await writeFile(log, '');
  const script = `#!${process.execPath}\nimport {readFileSync,appendFileSync} from 'node:fs';\nimport {basename} from 'node:path';\nconst program=basename(process.argv[1]);\nconst action=JSON.parse(readFileSync(process.env.JAIT_TRANSFER_PLAN,'utf8'))[program]??{};\nappendFileSync(process.env.JAIT_TRANSFER_LOG,JSON.stringify({program,args:process.argv.slice(2)})+'\\n');\nif(action.delayMs) await Bun.sleep(action.delayMs);\nawait Bun.write(Bun.stdout,(action.stdout??'').repeat(action.stdoutRepeat??1));\nawait Bun.write(Bun.stderr,(action.stderr??'').repeat(action.stderrRepeat??1));\nprocess.exit(action.code??0);\n`;
  for (const name of ['ssh', 'scp']) { if(call.plan?.[name]?.missing) continue; const p=join(bin,name); await writeFile(p,script); await chmod(p,call.plan?.[name]?.denied?0o600:0o700); }
  const env = { PATH: bin, JAIT_TRANSFER_PLAN: plan, JAIT_TRANSFER_LOG: log };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env,env); calls=[];
  let result: any;
  try { result={ok:true,value:await transferProjectWithScp(call.input)}; }
  catch(error) { result={ok:false,message:(error as Error).message}; }
  finally { for(const [key,value] of Object.entries(saved)) { if(value===undefined) delete process.env[key]; else process.env[key]=value; } }
  return { result, calls, peerCalls:(await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)), env, work };
}
