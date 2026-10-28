/** Import-only dependency injection. The production source body stays verbatim;
 * unique virtual names avoid Bun's special handling of native builtin exports. */
import {plugin} from 'bun';
import {mock} from 'bun:test';
export async function loadLiveView(ports:Record<string,any>){
 for(const name of ['child','fs','net','sandbox'])mock.module(`jait-fixture-liveview-${name}`,()=>ports[name]??{spawn:()=>{throw Error('unexpected host spawn');},existsSync:()=>{throw Error('unexpected display check');},createServer:()=>{throw Error('unexpected host socket');}});
 const handle=plugin({name:'contract-live-view-ports',setup(build){
  build.onLoad({filter:/[/\\]services[/\\]live-view-manager\.ts$/},async args=>{
   const source=await Bun.file(args.path).text();
   const replacements=[['"node:child_process"','"jait-fixture-liveview-child"'],['"node:fs"','"jait-fixture-liveview-fs"'],['"node:net"','"jait-fixture-liveview-net"'],['"../security/sandbox-manager.js"','"jait-fixture-liveview-sandbox"']];
   for(const [from] of replacements){if(source.split(`from ${from}`).length!==2)throw Error(`live-view import drift: ${from}`);}
   return {contents:source.replace('from "node:child_process"','from "jait-fixture-liveview-child"').replace('from "node:fs"','from "jait-fixture-liveview-fs"').replace('from "node:net"','from "jait-fixture-liveview-net"').replace('from "../security/sandbox-manager.js"','from "jait-fixture-liveview-sandbox"'),loader:'ts'};
  });

 }});
 try{return await import('../../../packages/gateway/src/services/live-view-manager.ts');}finally{handle?.dispose();}
}
