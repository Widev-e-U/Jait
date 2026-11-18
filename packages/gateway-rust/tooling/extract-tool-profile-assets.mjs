// Build/review tooling only; the native process embeds reviewed data without JS.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const source=new URL('../../gateway/src/security/tool-profiles.ts',import.meta.url).href;
const result=spawnSync('bun',['-e',`const p=await import(${JSON.stringify(source)});process.stdout.write(JSON.stringify(Object.fromEntries(p.listProfiles().map(name=>[name,p.serializeProfile(name).permissions])),null,2)+'\\n');`],{cwd:root,encoding:'utf8'});
if(result.status!==0)throw new Error(result.stderr||'profile extraction failed');
writeFileSync(fileURLToPath(new URL('../src/security/tool-profile-assets.json',import.meta.url)),result.stdout);
