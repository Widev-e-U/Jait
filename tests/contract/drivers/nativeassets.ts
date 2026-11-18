/** Actual Fastify request hook, real files and HTTP; no browser/build is involved. */
import Fastify from '../../../packages/gateway/node_modules/fastify/fastify.js';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {registerStaticAssetCache} from '../../../packages/gateway/src/services/static-asset-cache.ts';
export async function dispatch(call:any) {
  if(call.op!=='nativeassets.run')throw new Error('unknown native assets operation');
  const artifactRoot=resolve(import.meta.dirname,'../../../.jait/artifacts/gateway-rust/native-assets');await mkdir(artifactRoot,{recursive:true});
  const root=await mkdtemp(join(artifactRoot,'ts-'));const assets=join(root,'assets');await mkdir(assets);
  const write=async (spec:any)=>{if(!/^[a-zA-Z0-9_.-]+$/.test(spec.name))throw new Error('invalid fixture name');await writeFile(join(assets,spec.name),typeof spec.content==='string'?Buffer.from(spec.content):Buffer.alloc(spec.size??0,spec.byte??120));};
  let app:ReturnType<typeof Fastify>|undefined;
  try {
    for(const spec of call.files??[])await write(spec);
    app=Fastify({logger:false});registerStaticAssetCache(app,root);app.all('*',async(_request,reply)=>reply.type('text/plain; charset=utf-8').send('fallback'));
    const address=await app.listen({host:'127.0.0.1',port:0});const results:any[]=[];
    for(const step of call.steps??[]) {
      try {
        if(step.op==='write'){await write(step);results.push({ok:true});continue}
        if(step.op==='remove'){await rm(join(assets,step.name),{recursive:true,force:true});results.push({ok:true});continue}
        if(step.op==='directory'){await mkdir(join(assets,step.name));results.push({ok:true});continue}
        if(step.op==='symlink'){await writeFile(join(root,'outside'),'outside secret');await symlink(join(root,'outside'),join(assets,step.name));results.push({ok:true});continue}
        const response=await fetch(address+step.path,{method:step.method??'GET',headers:{connection:'close',...step.headers},redirect:'manual'});const body=Buffer.from(await response.arrayBuffer());
        results.push({status:response.status,size:body.byteLength,sha256:createHash('sha256').update(body).digest('hex'),cacheControl:response.headers.get('cache-control'),contentType:response.headers.get('content-type')});
      }catch{results.push({error:true})}
    }
    return results;
  }finally{app?.server.closeAllConnections();try{await app?.close()}finally{await rm(root,{recursive:true,force:true})}}
}
