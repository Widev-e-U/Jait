/** Only the download endpoint is redirected; real launcher validates/extracts/executes. */
const realFetch=globalThis.fetch;
globalThis.fetch=((input:any,init:any)=>{
  if(String(input)!=='https://contract.invalid/agent.tar') throw new Error('fixture blocks nonlocal download');
  return realFetch(process.env.JAIT_ACP_TEST_ORIGIN!,init);
}) as typeof fetch;
await import('../../../packages/gateway/src/providers/acp-binary-launcher.ts');
