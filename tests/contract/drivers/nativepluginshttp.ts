/** Actual route/auth registration; scripted manager does not load plugins. */
import {createRequire} from 'node:module';
import {registerPluginRoutes} from '../../../packages/gateway/src/routes/plugins.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
const requireGateway=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
export async function dispatch(call:any) {
  const {default:fastify}=await import(requireGateway.resolve('fastify'));
  const {default:cookie}=await import(requireGateway.resolve('@fastify/cookie'));
  const app=fastify({logger:false});await app.register(cookie);
  let step:any;const events:any[]=[];
  const manager=new Proxy({}, {get(_target,name) {return (...args:any[])=>{
    const op=String(name);events.push({name:op,args:structuredClone(args)});
    if(step.errorAt===op) {if('thrown' in step)throw step.thrown;throw Error(step.error);}
    return structuredClone(step.replies?.[op]??(op==='listInstalled'?[]:op==='getPluginConfig'?{}:null));
  };}});
  registerPluginRoutes(app,{jwtSecret:'plugins-route-fixture'} as any,manager as any);
  const results:any[]=[];
  try {
    for(step of call.steps) {
      const headers:any={...step.headers};
      if(step.user) {
        const token=await signAuthToken({id:step.user,username:'alice'},'plugins-route-fixture');
        if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;
      }
      const opts:any={method:step.method,url:step.path,headers};
      if('raw' in step)opts.payload=step.raw;
      else if('body' in step){opts.payload=JSON.stringify(step.body);headers['content-type']??='application/json';}
      const result=await app.inject(opts);
      let body:any=result.body;try{body=JSON.parse(result.body);}catch{}
      results.push({status:result.statusCode,body});
    }
    return {results,events};
  } finally {await app.close();}
}
