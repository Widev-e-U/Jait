import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MessengerHistory } from '../../../packages/gateway/src/services/messenger-history.ts';
const require=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
export async function recoverHistory(call:any) {
  const child=Bun.spawn([process.execPath,'--no-env-file',fileURLToPath(new URL('../matrix-history-fixture.mjs',import.meta.url))],{stdout:'pipe',stderr:'pipe',env:process.env});
  const fixture=JSON.parse(await new Response(child.stdout).text());
  await child.exited;
  const requests:string[]=[];
  const version={...fixture.version,auth_data:{...fixture.version.auth_data}};
  if(call.algorithm) version.algorithm=call.algorithm;
  if(call.wrongPublicKey) version.auth_data.public_key='wrong-public-key';
  const backup=fixture.backup;
  if(call.corrupt) {
    const room=Object.values(backup.rooms)[0] as any;
    (Object.values(room.sessions)[0] as any).session_data.ciphertext='invalid';
  }
  if(call.count) {
    const room=Object.values(backup.rooms)[0] as any;
    const entries=Object.entries(room.sessions);const template=entries[0]![1];
    room.sessions=Object.fromEntries(Array.from({length:call.count},(_,i)=>[i===0?entries[0]![0]:`synthetic-${i}`,template]));
  }
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:request=>{
    const path=new URL(request.url).pathname; requests.push(path);
    if(call.httpError) return Response.json({errcode:'M_UNKNOWN',error:'synthetic backup failure'},{status:503});
    return Response.json(path.endsWith('/version')?version:backup);
  }});
  const {MatrixClient}=require('matrix-bot-sdk');
  let history:MessengerHistory|undefined;
  try {
    history=await MessengerHistory.create('@archive:fixture','ARCHIVE');
    const exported=await history.restore(new MatrixClient(`http://127.0.0.1:${server.port}`,'local-unused'),call.key ?? fixture.recoveryKey);
    const decrypted=call.skipDecrypt?null:await history.decrypt('!shared:fixture',fixture.event);
    return {exportedCount:JSON.parse(exported).length,decrypted,requests};
  } catch(error:any) {return {error:error.message,requests};}
  finally {history?.close();server.stop(true);}
}
