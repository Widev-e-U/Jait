import {expect, it} from 'vitest';
import {AcpProvider} from './acp-provider.js';
const agent = `
const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);
 if(request.id===undefined)return;
 const result=request.method==='initialize'
 ? {protocolVersion:1,agentCapabilities:{},authMethods:[]}
 : request.method==='session/new'
 ? {sessionId:'test',configOptions:[{id:'model',category:'model',name:'Model',type:'select',currentValue:'opencode-go/glm-5.2',options:[{value:'opencode-go/glm-5.2',name:'OpenCode Go/GLM-5.2'}]}]}
 : {};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
});`;
it('reads OpenCode model config without requiring a reasoning-effort selector', async()=>{
 const provider=new AcpProvider({id:'opencode',name:'OpenCode',description:'test',command:process.execPath,args:['-e',agent]});
 try {expect(await provider.listModels()).toEqual([{id:'opencode-go/glm-5.2',name:'OpenCode Go/GLM-5.2',isDefault:true}]);}
 finally {await provider.dispose();}
});
