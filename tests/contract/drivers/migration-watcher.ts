import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectWatcher } from '../../../packages/gateway/src/services/project-watcher.ts';
export async function watchCaseSensitiveFiles() {
  const root=join(process.env.JAIT_STATE_DIR!,'watched');await mkdir(join(root,'ignored'),{recursive:true});
  const watcher=new ProjectWatcher({coalesceMs:200,ignore:['**/ignored/**'],allowGeneratedRoot:true});
  const batches:any[]=[];let failure:unknown;
  watcher.on('changes',events=>batches.push(...events));watcher.on('error',error=>{failure=error;});
  try {
    await watcher.watch(root);
    await Promise.all([writeFile(join(root,'A.ts'),'upper'),writeFile(join(root,'a.ts'),'lower'),writeFile(join(root,'ignored','noise.txt'),'ignored')]);
    const deadline=Date.now()+1500;
    while(batches.length<2 && !failure && Date.now()<deadline)await Bun.sleep(10);
  } finally {await watcher.stop();}
  if(failure)throw failure;
  return batches;
}
