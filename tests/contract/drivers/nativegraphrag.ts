import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export async function dispatch(call:any) {
  const {toGraphRagData,writeGraphRagExport}=await import('../../../packages/gateway/src/services/code-graph/graphrag-adapter.ts');
  if(call.op==='nativegraphrag.prepare') {
    const before=JSON.stringify(call.snapshot);
    const prepared=toGraphRagData(call.snapshot);
    return {prepared,unchanged:before===JSON.stringify(call.snapshot)};
  }
  const originalCwd=process.cwd();
  if(call.cwd) process.chdir(call.cwd);
  const output=resolve(root,call.absoluteDirectory);
  const target=call.relative?call.directory:output;
  const originalDate=globalThis.Date;
  const frozen=call.now??1740000000000;
  globalThis.Date=class extends originalDate {
    constructor(value?:any){ super(arguments.length?value:frozen); }
  } as any;
  try {
    if(call.collision==='directory-file') {
      await mkdir(resolve(output,'..'),{recursive:true});
      await writeFile(output,'original directory marker');
    } else if(call.collision) {
      await mkdir(join(output,call.collision),{recursive:true});
    }
    let result:any;
    try{result={manifest:await writeGraphRagExport(call.snapshot,target)};}
    catch(error:any){
      result={error:error instanceof RangeError?'InvalidDate':error.code??error.message};
    }
    const files:any={};
    for(const name of ['entities.jsonl','relationships.jsonl','text_units.jsonl','manifest.json']) {
      try {files[name]=await readFile(join(output,name),'utf8');} catch {}
    }
    return {result,files};
  } finally {globalThis.Date=originalDate;process.chdir(originalCwd);}
}
